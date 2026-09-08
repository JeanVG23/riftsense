"""Amorçage du registre KV depuis config/accounts.json.

Idempotence : relancer l'amorçage ne doit ni dupliquer un slug dans l'index, ni
écraser un `last_ingest_ts` déjà publié par le service d'ingestion.
"""
from __future__ import annotations

import json

import seed_accounts


def test_build_records_marque_les_comptes_curated():
    records = seed_accounts.build_records(
        [{"slug": "spadzze", "riot_id": "Spadzze#euw", "region": "euw1"}]
    )
    assert records == [{
        "slug": "spadzze", "riot_id": "Spadzze#euw", "region": "euw1", "source": "curated",
    }]


class _FakeKV:
    def __init__(self, initial=None):
        self.store = dict(initial or {})

    def get(self, key):
        return self.store.get(key)

    def put(self, key, value):
        self.store[key] = value


def test_seed_est_idempotent():
    kv = _FakeKV()
    records = seed_accounts.build_records(
        [{"slug": "spadzze", "riot_id": "Spadzze#euw", "region": "euw1"}]
    )
    seed_accounts.seed(kv, records)
    seed_accounts.seed(kv, records)
    assert json.loads(kv.store["accounts:index"]) == ["spadzze"]


def test_seed_preserve_les_champs_ecrits_par_le_service():
    kv = _FakeKV({"account:spadzze": json.dumps({
        "slug": "spadzze", "riot_id": "Spadzze#euw", "region": "euw1",
        "source": "curated", "puuid": "abc", "last_ingest_ts": "2026-09-08T10:00:00",
    })})
    records = seed_accounts.build_records(
        [{"slug": "spadzze", "riot_id": "Spadzze#euw", "region": "euw1"}]
    )
    seed_accounts.seed(kv, records)
    stored = json.loads(kv.store["account:spadzze"])
    assert stored["puuid"] == "abc"
    assert stored["last_ingest_ts"] == "2026-09-08T10:00:00"
