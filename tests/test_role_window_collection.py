"""La phase fenêtre paie le moins possible, et ne ment pas sur ses échecs."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))
sys.path.insert(0, str(ROOT / "service"))

import riot_ingest  # noqa: E402
import riotlib as rl  # noqa: E402


class _Client:
    """Sert des matchs synthétiques et compte ce qu'on lui demande."""

    def __init__(self, roles: dict[str, str], failing: set[str] | None = None):
        self.roles, self.failing = roles, failing or set()
        self.match_calls, self.timeline_calls = [], []

    def match(self, match_id):
        self.match_calls.append(match_id)
        if match_id in self.failing:
            raise RuntimeError("retries épuisés")
        return {"metadata": {"participants": ["P"]},
                "info": {"participants": [{"teamPosition": self.roles[match_id]}]}}

    def timeline(self, match_id):
        self.timeline_calls.append(match_id)
        return {"frames": []}


@pytest.fixture(autouse=True)
def _isoler(tmp_path, monkeypatch):
    monkeypatch.setattr(rl, "DATA", tmp_path)
    monkeypatch.setattr(rl, "RAW_DIR", tmp_path / rl.LAYER_RAW)
    monkeypatch.setattr(
        rl, "extract_game",
        lambda match, timeline, puuid: {"match_id": "x", "role": "JUNGLE"})


def _loin() -> float:
    return time.monotonic() + 10_000


def test_la_timeline_n_est_pas_payee_hors_role():
    roles = {"M1": "JUNGLE", "M2": "MIDDLE", "M3": "JUNGLE"}
    client = _Client(roles)
    harvest = riot_ingest.collect_role_window(
        client, "P", ["M1", "M2", "M3"], "JUNGLE",
        needed=2, scan_index={}, deadline=_loin())
    assert len(harvest.games) == 2
    assert client.match_calls == ["M1", "M2", "M3"]
    assert client.timeline_calls == ["M1", "M3"]


def test_on_s_arrete_des_que_la_fenetre_est_pleine():
    client = _Client({f"M{i}": "JUNGLE" for i in range(1, 6)})
    harvest = riot_ingest.collect_role_window(
        client, "P", [f"M{i}" for i in range(1, 6)], "JUNGLE",
        needed=2, scan_index={}, deadline=_loin())
    assert len(harvest.games) == 2
    assert client.match_calls == ["M1", "M2"]


def test_l_index_de_scan_evite_de_repayer_une_partie_hors_role():
    client = _Client({"M1": "MIDDLE", "M2": "JUNGLE"})
    harvest = riot_ingest.collect_role_window(
        client, "P", ["M1", "M2"], "JUNGLE", needed=1,
        scan_index={"M1": "MIDDLE"}, deadline=_loin())
    assert client.match_calls == ["M2"]
    assert len(harvest.games) == 1


def test_l_index_de_scan_est_enrichi_par_la_collecte():
    index = {}
    client = _Client({"M1": "MIDDLE", "M2": "JUNGLE"})
    riot_ingest.collect_role_window(
        client, "P", ["M1", "M2"], "JUNGLE", needed=1,
        scan_index=index, deadline=_loin())
    assert index == {"M1": "MIDDLE", "M2": "JUNGLE"}


def test_une_panne_est_comptee_et_non_confondue_avec_un_hors_role():
    client = _Client({"M1": "JUNGLE", "M2": "JUNGLE"}, failing={"M1"})
    harvest = riot_ingest.collect_role_window(
        client, "P", ["M1", "M2"], "JUNGLE", needed=2,
        scan_index={}, deadline=_loin())
    assert harvest.failures == 1


def test_la_collecte_s_arrete_au_dela_du_quota_d_echecs():
    ids = [f"M{i}" for i in range(1, 12)]
    client = _Client({match_id: "JUNGLE" for match_id in ids}, failing=set(ids))
    harvest = riot_ingest.collect_role_window(
        client, "P", ids, "JUNGLE", needed=5, scan_index={}, deadline=_loin())
    assert harvest.failures <= riot_ingest.MAX_FETCH_FAILURES + 1
    assert len(client.match_calls) <= riot_ingest.MAX_FETCH_FAILURES + 1


def test_une_echeance_depassee_arrete_proprement():
    client = _Client({f"M{i}": "JUNGLE" for i in range(1, 6)})
    harvest = riot_ingest.collect_role_window(
        client, "P", [f"M{i}" for i in range(1, 6)], "JUNGLE", needed=5,
        scan_index={}, deadline=time.monotonic() - 1)
    assert harvest.deadline_reached is True
    assert client.match_calls == []


def test_le_role_du_joueur_se_lit_dans_le_match():
    match = {"metadata": {"participants": ["A", "P"]},
             "info": {"participants": [{"teamPosition": "TOP"},
                                         {"teamPosition": "UTILITY"}]}}
    assert riot_ingest.role_in_match(match, "P") == "SUPPORT"
    assert riot_ingest.role_in_match(match, "INCONNU") is None
