"""Rattrapage de l'icone et du niveau sur les comptes deja collectes.

Le champ n'existe que depuis que `riot_ingest` le lit dans Match-V5 : sans
rattrapage, un compte inscrit avant garde l'icone inventee par le site jusqu'a
sa prochaine collecte complete.
"""
from __future__ import annotations

import json

import backfill_summoner_profiles as backfill


def _match(puuid: str, icon: int, level: int) -> dict:
    return {"info": {"participants": [
        {"puuid": "AUTRE", "profileIcon": 1, "summonerLevel": 1},
        {"puuid": puuid, "profileIcon": icon, "summonerLevel": level},
    ]}}


class _FakeKV:
    def __init__(self, store=None):
        self.store = dict(store or {})
        self.puts: list[str] = []

    def get(self, key):
        return self.store.get(key)

    def put(self, key, value):
        self.store[key] = value
        self.puts.append(key)


def _kv(account: dict, games: list[dict]) -> _FakeKV:
    slug = account["slug"]
    return _FakeKV({
        "accounts:index": json.dumps([slug]),
        f"account:{slug}": json.dumps(account),
        f"silver:{slug}:games": "\n".join(json.dumps(game) for game in games),
    })


COMPTE = {"slug": "allez-bodycount-viego", "riot_id": "Allez Bodycount#VIEGO",
          "region": "euw1", "source": "public"}
PARTIES = [
    {"match_id": "EUW1_0000001", "puuid": "P", "game_ts": 1000},
    {"match_id": "EUW1_0000002", "puuid": "P", "game_ts": 3000},
    {"match_id": "EUW1_0000003", "puuid": "P", "game_ts": 2000},
]


def test_complete_un_compte_depuis_sa_partie_la_plus_recente():
    kv = _kv(COMPTE, PARTIES)
    lus = []

    def read_match(region, match_id):
        lus.append((region, match_id))
        return _match("P", 4403, 312)

    assert backfill.backfill(kv, read_match) == {
        "allez-bodycount-viego": {"icon": 4403, "level": 312}}
    # La plus recente, pas la premiere de la liste : l'icone lue est celle du
    # jour de cette partie.
    assert lus == [("euw1", "EUW1_0000002")]
    stored = json.loads(kv.store["account:allez-bodycount-viego"])
    assert (stored["icon"], stored["level"]) == (4403, 312)
    # Le reste de l'enregistrement est preserve, y compris `source`.
    assert stored["riot_id"] == "Allez Bodycount#VIEGO"
    assert stored["source"] == "public"


def test_ne_relit_pas_un_compte_deja_complet():
    """Un appel Riot par compte deja renseigne serait du gaspillage pur."""
    kv = _kv({**COMPTE, "icon": 12, "level": 34}, PARTIES)

    def read_match(region, match_id):
        raise AssertionError("aucune partie ne doit etre relue")

    assert backfill.backfill(kv, read_match) == {}
    assert kv.puts == []


def test_force_relit_meme_un_compte_complet():
    kv = _kv({**COMPTE, "icon": 12, "level": 34}, PARTIES)
    assert backfill.backfill(kv, lambda region, match_id: _match("P", 99, 500),
                             force=True)
    stored = json.loads(kv.store["account:allez-bodycount-viego"])
    assert (stored["icon"], stored["level"]) == (99, 500)


def test_un_compte_sans_partie_publiee_est_saute_sans_echec():
    kv = _kv(COMPTE, [])
    assert backfill.backfill(kv, lambda region, match_id: _match("P", 1, 1)) == {}
    assert kv.puts == []


def test_un_profil_introuvable_n_ecrase_pas_l_enregistrement():
    """Rien plutot qu'une valeur douteuse : le compte reste tel quel."""
    kv = _kv(COMPTE, PARTIES)
    assert backfill.backfill(kv, lambda region, match_id: _match("AUTRE-PUUID", 1, 1)) == {}
    assert backfill.backfill(kv, lambda region, match_id: None) == {}
    assert kv.puts == []


def test_un_compte_indexe_sans_enregistrement_n_interrompt_pas_les_suivants():
    kv = _FakeKV({
        "accounts:index": json.dumps(["fantome", COMPTE["slug"]]),
        f"account:{COMPTE['slug']}": json.dumps(COMPTE),
        f"silver:{COMPTE['slug']}:games": json.dumps(PARTIES[0]),
    })
    assert list(backfill.backfill(kv, lambda region, match_id: _match("P", 7, 8))) \
        == [COMPTE["slug"]]


def test_newest_game_tolere_un_silver_vide_ou_absent():
    assert backfill.newest_game(None) is None
    assert backfill.newest_game("") is None
    assert backfill.newest_game("\n\n") is None
