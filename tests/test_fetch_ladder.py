"""Snapshot du ladder : une journée n'est lisible qu'une fois marquée complète.

Sans ça, une interruption au milieu de la pagination produirait un corpus
silencieusement tronqué, et les joueurs manquants passeraient pour non classés.
"""
import json

import pytest

import fetch_ladder as fl


class FakeClient:
    """apex_league rend tout d'un coup ; league_exp_entries pagine par 205."""

    def __init__(self, apex, diamond):
        self.apex, self.diamond = apex, diamond

    def apex_league(self, tier, queue=None):
        return self.apex.get(tier, [])

    def league_exp_entries(self, tier, division, page=1):
        entries = self.diamond.get(division, [])
        start = (page - 1) * 205
        return entries[start:start + 205]


def _entry(puuid, lp=50):
    return {"puuid": puuid, "leaguePoints": lp, "wins": 10, "losses": 5}


def test_snapshot_rows_couvre_apex_et_diamond():
    client = FakeClient(
        apex={"challenger": [_entry("c1")], "grandmaster": [_entry("g1")],
              "master": [_entry("m1")]},
        diamond={"I": [_entry("d1")], "II": [], "III": [], "IV": []})
    rows = list(fl.snapshot_rows(client))
    assert {r["puuid"] for r in rows} == {"c1", "g1", "m1", "d1"}
    tiers = {r["puuid"]: r["tier"] for r in rows}
    assert tiers["c1"] == "CHALLENGER"
    assert tiers["d1"] == "DIAMOND"
    assert {r["puuid"]: r["division"] for r in rows}["d1"] == "I"


def test_snapshot_rows_dedoublonne_un_puuid_vu_deux_fois():
    client = FakeClient(apex={"challenger": [_entry("x")], "master": [_entry("x")]},
                        diamond={"I": [], "II": [], "III": [], "IV": []})
    assert len(list(fl.snapshot_rows(client))) == 1


def test_load_snapshot_refuse_une_journee_non_marquee(tmp_path):
    fl.write_snapshot([{"puuid": "a", "tier": "MASTER", "division": "I",
                        "lp": 1, "wins": 1, "losses": 1}], "euw1", "2026-09-17", tmp_path)
    with pytest.raises(FileNotFoundError):
        fl.load_snapshot("euw1", "2026-09-17", tmp_path)


def test_load_snapshot_lit_une_journee_marquee(tmp_path):
    rows = [{"puuid": "a", "tier": "MASTER", "division": "I",
             "lp": 1, "wins": 1, "losses": 1}]
    fl.write_snapshot(rows, "euw1", "2026-09-17", tmp_path)
    fl.mark_complete("euw1", "2026-09-17", tmp_path, len(rows))
    loaded = fl.load_snapshot("euw1", "2026-09-17", tmp_path)
    assert loaded["a"]["tier"] == "MASTER"


def test_manifest_enregistre_le_compte(tmp_path):
    fl.write_snapshot([], "euw1", "2026-09-17", tmp_path)
    fl.mark_complete("euw1", "2026-09-17", tmp_path, 149411)
    manifest = json.loads((tmp_path / "euw1" / "manifest.json").read_text())
    assert manifest["2026-09-17"]["n_rows"] == 149411
    assert manifest["2026-09-17"]["complete"] is True


def test_load_snapshot_verifie_le_compte_du_manifeste(tmp_path):
    rows = [{"puuid": "a", "tier": "MASTER", "division": "I",
             "lp": 1, "wins": 1, "losses": 1}]
    fl.write_snapshot(rows, "euw1", "2026-09-17", tmp_path)
    fl.mark_complete("euw1", "2026-09-17", tmp_path, n_rows=2)
    with pytest.raises(ValueError, match="corrompu"):
        fl.load_snapshot("euw1", "2026-09-17", tmp_path)


def test_recollecte_invalide_d_abord_l_ancien_snapshot(tmp_path):
    row = {"puuid": "a", "tier": "MASTER", "division": "I",
           "lp": 1, "wins": 1, "losses": 1}
    fl.write_snapshot([row], "euw1", "2026-09-17", tmp_path)
    fl.mark_complete("euw1", "2026-09-17", tmp_path, n_rows=1)
    fl.write_snapshot([row], "euw1", "2026-09-17", tmp_path)
    with pytest.raises(FileNotFoundError):
        fl.load_snapshot("euw1", "2026-09-17", tmp_path)


class PagedClient:
    """league-exp rend des pages de taille variable : seule une page VIDE finit."""

    def __init__(self, pages: dict[int, list]):
        self.pages = pages
        self.requested: list[int] = []

    def apex_league(self, tier, queue=None):
        return []

    def league_exp_entries(self, tier, division, page=1):
        if division != "I":
            return []
        self.requested.append(page)
        return self.pages.get(page, [])


def test_snapshot_rows_poursuit_apres_une_page_incomplete():
    """Une page courte n'est pas la fin du ladder.

    S'arrêter dessus tronque la division tout en la marquant complète : le
    manifeste certifierait alors un corpus amputé.
    """
    client = PagedClient({1: [_entry("d1"), _entry("d2")], 2: [_entry("d3")]})
    rows = list(fl.snapshot_rows(client))
    assert {r["puuid"] for r in rows} == {"d1", "d2", "d3"}


def test_snapshot_rows_s_arrete_sur_la_premiere_page_vide():
    client = PagedClient({1: [_entry("d1")]})
    list(fl.snapshot_rows(client))
    assert client.requested == [1, 2]
