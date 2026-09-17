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

ACCOUNTS_FILE = ROOT / "config" / "accounts.json"
CONFIG_FIELDS = ("slug", "riot_id", "region")


def build_records(accounts: list[dict]) -> list[dict]:
    """Comptes de configuration -> enregistrements de registre."""
    return [
        {**{field: account[field] for field in CONFIG_FIELDS}, "source": "curated"}
        for account in accounts
    ]


def seed(kv, records: list[dict]) -> list[str]:
    """Écrit les enregistrements et met l'index à jour. Rend les slugs indexés."""
    raw_index = kv.get(kv_key("accounts_index"))
    slugs = json.loads(raw_index) if raw_index else []
    for record in records:
        existing_raw = kv.get(kv_key("account", slug=record["slug"]))
        existing = json.loads(existing_raw) if existing_raw else {}
        merged = {**existing, **record}
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
        kv = KV(
            os.environ["CF_ACCOUNT_ID"],
            os.environ["CF_KV_NAMESPACE_ID"],
            os.environ["CF_API_TOKEN"],
        )
    slugs = seed(kv, records)
    print(f"registre amorce : {len(records)} compte(s), index = {slugs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
