"""src/pipeline_ops/migrate_kv_prefix.py : copie additive coaching: -> riftsense:

0 suppression ici : on copie, on vérifie, le nettoyage de l'ancien préfixe est
une étape séparée et volontairement manuelle (cf. plan de rename).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
import riotlib as rl  # noqa: E402  (convention flat-import du repo)

import requests

OLD_PREFIX = "coaching:"
NEW_PREFIX = "riftsense:"

# Même chargement que sync_cloudflare.py : .env d'abord, l'environnement réel
# prime. Mêmes noms de variables (CF_NAMESPACE_ID, pas CF_KV_NAMESPACE_ID).
_ENV = rl.load_env()
for _key in ("CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_NAMESPACE_ID"):
    if os.environ.get(_key):
        _ENV[_key] = os.environ[_key]


def _base_url() -> str:
    account_id = _ENV["CF_ACCOUNT_ID"]
    namespace_id = _ENV["CF_NAMESPACE_ID"]
    return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}"


def _headers() -> dict:
    return {"Authorization": f"Bearer {_ENV['CF_API_TOKEN']}"}


def list_old_keys() -> list[str]:
    keys, cursor = [], None
    while True:
        params = {"prefix": OLD_PREFIX}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(f"{_base_url()}/keys", headers=_headers(), params=params, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        keys.extend(k["name"] for k in body["result"])
        cursor = body.get("result_info", {}).get("cursor")
        if not cursor:
            break
    return keys


def migrate(dry_run: bool = True) -> None:
    old_keys = list_old_keys()
    print(f"{len(old_keys)} clé(s) sous {OLD_PREFIX!r}")
    for old_key in old_keys:
        new_key = NEW_PREFIX + old_key[len(OLD_PREFIX):]
        if dry_run:
            print(f"  [dry-run] {old_key} -> {new_key}")
            continue
        value = requests.get(f"{_base_url()}/values/{old_key}", headers=_headers(), timeout=30)
        value.raise_for_status()
        put = requests.put(
            f"{_base_url()}/values/{new_key}", headers=_headers(), data=value.content, timeout=30,
        )
        put.raise_for_status()
        print(f"  {old_key} -> {new_key}")


if __name__ == "__main__":
    migrate(dry_run="--run" not in sys.argv)