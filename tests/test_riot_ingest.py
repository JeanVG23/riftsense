"""Ingestion d'un joueur : de bout en bout, sans réseau.

Le client Riot est un double qui sert les documents bruts de tests/fixtures/demo/ ;
le KV et le R2 sont des doubles en mémoire. On vérifie ce qui est PUBLIÉ : les clés
KV attendues, le raw indexé par match, et les erreurs typées.

`demo_data` (tests/conftest.py) fait pointer champion_profiles.STATIC_DIR vers le
Data Dragon élagué de la fixture : `write_gold` en a besoin pour `by_lane_context`.
La redirection de la pile médaillon vers le répertoire du job, elle, est faite par
riot_ingest.run.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import errors
import riot_ingest
import riotlib as rl

FIXTURE_RAW = Path(__file__).resolve().parent / "fixtures" / "demo" / "01_raw"


def _demo_match_ids(limit: int = 3) -> list[str]:
    return sorted({p.name.split("_match")[0]
                   for p in FIXTURE_RAW.glob("*_match.json.zst")})[:limit]


class FakeRiotClient:
    """Sert les documents de la fixture comme le ferait l'API Riot.

    Les documents sont lus par CHEMIN EXPLICITE, pas par rl._read_raw : le job
    redirige la couche raw vers son répertoire temporaire, et un double qui
    dépendrait de cette redirection ne testerait plus rien.
    """

    def __init__(self, match_ids, puuid="PUUID-DEMO", entries=None):
        self._match_ids = list(match_ids)
        self._puuid = puuid
        self._entries = entries if entries is not None else [{
            "queueType": "RANKED_SOLO_5x5", "tier": "MASTER", "rank": "I",
            "leaguePoints": 120, "wins": 40, "losses": 30,
        }]

    def puuid_from_riot_id(self, game_name, tag_line):
        return self._puuid

    def entries_by_puuid(self, puuid):
        return self._entries

    def match_ids(self, puuid, count=20, queue=None, start=0, start_time=None):
        return self._match_ids[:count]

    def match(self, match_id):
        return rl._read_raw_at(FIXTURE_RAW / f"{match_id}_match.json.zst")

    def timeline(self, match_id):
        return rl._read_raw_at(FIXTURE_RAW / f"{match_id}_timeline.json.zst")


class FakeKV:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def put(self, key, value):
        self.store[key] = value


class FakeR2:
    def __init__(self):
        self.keys = []

    def put_raw(self, platform, match_id, kind, blob):
        from storage import R2Storage
        key = R2Storage.raw_key(platform, match_id, kind)
        self.keys.append(key)
        return key


@pytest.fixture()
def demo_puuid():
    """Un puuid réellement présent dans la première partie de la fixture."""
    match_id = _demo_match_ids(1)[0]
    match = rl._read_raw_at(FIXTURE_RAW / f"{match_id}_match.json.zst")
    return match["metadata"]["participants"][0]


def _run(tmp_path, client, kv, r2, slug="demo-euw"):
    return riot_ingest.run(
        {"slug": slug, "riot_id": "Demo#euw", "platform": "euw1"},
        client=client, kv=kv, r2=r2, data_dir=tmp_path, max_games=3,
    )


def _pile_medaillon() -> tuple:
    return rl.DATA, rl.RAW_DIR, rl.SILVER_DIR, rl.GOLD_DIR


def test_riot_id_introuvable(tmp_path):
    before = _pile_medaillon()
    client = FakeRiotClient(_demo_match_ids(), puuid=None)
    with pytest.raises(errors.RiotIdNotFound):
        _run(tmp_path, client, FakeKV(), FakeR2())
    assert _pile_medaillon() == before


def test_aucune_partie_classee(tmp_path, demo_puuid):
    before = _pile_medaillon()
    client = FakeRiotClient([], puuid=demo_puuid)
    with pytest.raises(errors.NoRankedGames):
        _run(tmp_path, client, FakeKV(), FakeR2())
    assert _pile_medaillon() == before


def test_publie_les_cles_attendues(tmp_path, demo_data, demo_puuid):
    kv, r2 = FakeKV(), FakeR2()
    result = _run(tmp_path, FakeRiotClient(_demo_match_ids(), puuid=demo_puuid), kv, r2)

    assert result["status"] == "ok"
    assert result["n_games"] >= 1
    assert "silver:demo-euw:games" in kv.store
    assert "silver:demo-euw:rank" in kv.store
    assert "gold:demo-euw:all" in kv.store
    assert "account:demo-euw" in kv.store
    assert json.loads(kv.store["accounts:index"]) == ["demo-euw"]

    account = json.loads(kv.store["account:demo-euw"])
    assert account["source"] == "public"
    assert account["puuid"] == demo_puuid
    assert account["last_ingest_ts"]

    games = [json.loads(line)
             for line in kv.store["silver:demo-euw:games"].splitlines() if line.strip()]
    assert games and all(game["puuid"] == demo_puuid for game in games)


def test_le_raw_est_pousse_indexe_par_match(tmp_path, demo_data, demo_puuid):
    r2 = FakeR2()
    _run(tmp_path, FakeRiotClient(_demo_match_ids(), puuid=demo_puuid), FakeKV(), r2)
    assert r2.keys, "aucun raw publié"
    assert all(key.startswith("raw/euw1/") for key in r2.keys)
    assert all("demo-euw" not in key for key in r2.keys)


def test_la_pile_medaillon_est_restauree(tmp_path, demo_data, demo_puuid):
    """Une redirection qui survivrait au job contaminerait le suivant : le
    service tourne dans un processus de longue durée. Les QUATRE attributs
    (DATA, RAW_DIR, SILVER_DIR, GOLD_DIR) sont redirigés par `run` : n'en
    vérifier qu'un seul laisserait passer une restauration partielle."""
    before = _pile_medaillon()
    _run(tmp_path, FakeRiotClient(_demo_match_ids(), puuid=demo_puuid), FakeKV(), FakeR2())
    assert _pile_medaillon() == before


def test_deuxieme_ingestion_conserve_l_historique(tmp_path, demo_data):
    """`merge_jsonl` fusionne contre le disque du répertoire temporaire du job,
    toujours vide sans amorçage depuis KV : sans la fusion réelle, la deuxième
    ingestion d'un même joueur remplacerait tout son historique par les
    quelques parties fraîchement collectées."""
    puuid = "DEMO-PUUID-0009"  # présent dans (quasi) toutes les parties de la fixture
    kv = FakeKV()

    premiere = _run(tmp_path / "job1", FakeRiotClient(["DEMO1_0000001"], puuid=puuid),
                     kv, FakeR2())
    assert premiere["n_games"] == 1
    apres_premiere = {json.loads(line)["match_id"]
                      for line in kv.store["silver:demo-euw:games"].splitlines()
                      if line.strip()}
    assert apres_premiere == {"DEMO1_0000001"}

    seconde = _run(tmp_path / "job2", FakeRiotClient(["DEMO1_0000002"], puuid=puuid),
                    kv, FakeR2())
    assert seconde["n_games"] == 1
    apres_seconde = {json.loads(line)["match_id"]
                     for line in kv.store["silver:demo-euw:games"].splitlines()
                     if line.strip()}
    assert apres_seconde == {"DEMO1_0000001", "DEMO1_0000002"}, \
        "la deuxieme ingestion a ecrase l'historique de la premiere"


def test_scopes_for_suit_le_role_dominant():
    assert riot_ingest.scopes_for(
        [{"role": "BOTTOM"}, {"role": "BOTTOM"}, {"role": "TOP"}]) == ["all", "adc"]
    assert riot_ingest.scopes_for([{"role": "JUNGLE"}]) == ["all", "jungle"]
    assert riot_ingest.scopes_for([]) == ["all"]
    assert riot_ingest.scopes_for([{"role": "?"}]) == ["all"]
