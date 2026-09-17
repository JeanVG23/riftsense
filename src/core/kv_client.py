"""src/core/kv_client.py : client REST Workers KV.

Vivait dans sync_cloudflare.py. Trois consommateurs le veulent désormais : le
sync, l'amorçage du registre, et le service d'ingestion Cloud Run dont l'image
ne copie que src/core/. Un module partagé plutôt que trois copies qui divergent.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

import requests

KV_URL = (
    "https://api.cloudflare.com/client/v4/accounts/{account}"
    "/storage/kv/namespaces/{namespace}/values/{key}"
)


class KV:
    """Client REST minimal Workers KV (PUT/GET) et journal des clés poussées."""

    def __init__(self, account: str, namespace: str, token: str):
        self.account = account
        self.namespace = namespace
        self.token = token
        self.puts: list[str] = []

    def _url(self, key: str) -> str:
        return KV_URL.format(
            account=self.account,
            namespace=self.namespace,
            key=quote(key, safe=""),
        )

    def put(self, key: str, value: str) -> None:
        response = requests.put(
            self._url(key),
            data=value.encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "text/plain; charset=utf-8",
            },
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"KV PUT {key} -> HTTP {response.status_code} : {response.text[:200]}"
            )
        self.puts.append(key)

    def get(self, key: str) -> str | None:
        response = requests.get(
            self._url(key),
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=30,
        )
        if response.status_code == 200:
            return response.text
        if response.status_code == 404:
            return None
        raise RuntimeError(
            f"KV GET {key} -> HTTP {response.status_code} : {response.text[:200]}"
        )


class DryKV(KV):
    """Journalise les écritures sans accès réseau."""

    def __init__(self):
        super().__init__("dry-run", "dry-run", "dry-run")

    def put(self, key: str, value: str) -> None:
        del value
        self.puts.append(key)

    def get(self, key: str) -> str | None:
        del key
        return None


def put_json(kv: KV, key: str, value: Any) -> None:
    kv.put(key, json.dumps(value, ensure_ascii=False))
