#!/usr/bin/env python3
"""seed_accounts : publie config/accounts.json dans le registre KV.

Les comptes historiques vivaient dans une constante TypeScript compilée. Ils
deviennent des enregistrements KV comme les inscriptions publiques, avec
`source: curated` pour rester distinguables au moment où le ML s'ouvrira.

Idempotent : les champs écrits par le service d'ingestion (puuid, last_ingest_ts)
sont préservés, seuls les champs de configuration sont réappliqués.

Usage :
    poetry run python3 src/collection/seed_accounts.py [--dry-run]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "core"))

from cli import flag  # noqa: E402
from kv_client import KV, DryKV  # noqa: E402
from kv_keys import key as kv_key  # noqa: E402
from riotlib import load_env  # noqa: E402

ACCOUNTS_FILE = ROOT / "config" / "accounts.json"
CONFIG_FIELDS = ("slug", "riot_id", "region")
# Icône et niveau : valeurs d'AMORÇAGE seulement. Le service d'ingestion les lit
# dans Match-V5 à chaque collecte ; les réappliquer depuis le fichier de
# configuration reposerait une valeur figée par-dessus la vraie.
SEED_ONLY_FIELDS = ("icon", "level")


def _account_group(account: dict) -> str:
    if "group" in account and account["group"]:
        return str(account["group"])
    return "owner" if account.get("slug") in ("spadzze", "aceofspadzze") else "permanent"


def build_records(accounts: list[dict]) -> list[dict]:
    """Comptes de configuration -> enregistrements de registre."""
    records = []
    for account in accounts:
        rec = {
            **{field: account[field] for field in CONFIG_FIELDS},
            "group": _account_group(account),
            "source": "curated",
        }
        for opt in SEED_ONLY_FIELDS:
            if opt in account and account[opt] is not None:
                rec[opt] = account[opt]
        records.append(rec)
    return records



def seed(kv, records: list[dict]) -> list[str]:
    """Écrit les enregistrements et met l'index à jour. Rend les slugs indexés."""
    raw_index = kv.get(kv_key("accounts_index"))
    slugs = json.loads(raw_index) if raw_index else []
    for record in records:
        existing_raw = kv.get(kv_key("account", slug=record["slug"]))
        existing = json.loads(existing_raw) if existing_raw else {}
        merged = {**existing, **record}
        for field in SEED_ONLY_FIELDS:
            if existing.get(field) is not None:
                merged[field] = existing[field]
        kv.put(kv_key("account", slug=record["slug"]),
               json.dumps(merged, ensure_ascii=False))
        if record["slug"] not in slugs:
            slugs.append(record["slug"])
    kv.put(kv_key("accounts_index"), json.dumps(slugs))
    return slugs


def main(argv: list[str] | None = None) -> int:
    del argv
    records = build_records(json.loads(ACCOUNTS_FILE.read_text()))
    if flag("--dry-run"):
        kv = DryKV()
    else:
        env = load_env()
        account = os.environ.get("CF_ACCOUNT_ID") or env.get("CF_ACCOUNT_ID")
        namespace = (os.environ.get("CF_NAMESPACE_ID")
                     or os.environ.get("CF_KV_NAMESPACE_ID")
                     or env.get("CF_NAMESPACE_ID")
                     or env.get("CF_KV_NAMESPACE_ID"))
        token = os.environ.get("CF_API_TOKEN") or env.get("CF_API_TOKEN")
        if not account or not namespace or not token:
            raise SystemExit(
                "CF_API_TOKEN / CF_ACCOUNT_ID / CF_NAMESPACE_ID manquants dans .env"
            )
        kv = KV(account, namespace, token)
    slugs = seed(kv, records)
    print(f"registre amorce : {len(records)} compte(s), index = {slugs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
