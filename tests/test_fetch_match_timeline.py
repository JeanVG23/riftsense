"""Une partie hors rôle et une panne réseau ne sont pas le même événement.

get_match_timeline rendait None pour les deux. La phase fenêtre de l'ingestion doit
les distinguer, sans quoi une panne Riot serait annoncée au visiteur comme un
historique trop court : on accuserait son compte au lieu du service.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))

import riotlib as rl  # noqa: E402


def _match(puuid: str, role: str) -> dict:
    return {
        "metadata": {"participants": [puuid]},
        "info": {"participants": [{"teamPosition": role}]},
    }


class _Client:
    def __init__(self, match=None, timeline=None, raises=None):
        self._match, self._timeline, self._raises = match, timeline, raises

    def match(self, match_id):
        if self._raises:
            raise self._raises
        return self._match

    def timeline(self, match_id):
        return self._timeline


@pytest.fixture(autouse=True)
def _raw_dans_le_tmp(tmp_path, monkeypatch):
    """Sans cette redirection, le cache raw du dépôt servirait les documents."""
    monkeypatch.setattr(rl, "DATA", tmp_path)
    monkeypatch.setattr(rl, "RAW_DIR", tmp_path / rl.LAYER_RAW)


def test_une_partie_hors_role_est_signalee_comme_telle():
    client = _Client(match=_match("P", "JUNGLE"), timeline={"t": 1})
    result = rl.fetch_match_timeline(client, "EUW1_1",
                                     target_puuid="P", target_role="MIDDLE")
    assert result.status == "role_mismatch"
    assert result.timeline is None


def test_une_panne_reseau_est_signalee_comme_un_echec():
    client = _Client(raises=RuntimeError("retries épuisés"))
    result = rl.fetch_match_timeline(client, "EUW1_1")
    assert result.status == "failed"


def test_une_partie_du_role_est_rendue_complete():
    client = _Client(match=_match("P", "MIDDLE"), timeline={"t": 1})
    result = rl.fetch_match_timeline(client, "EUW1_1",
                                     target_puuid="P", target_role="MIDDLE")
    assert result.status == "ok"
    assert result.timeline == {"t": 1}


def test_l_ancienne_fonction_garde_son_contrat():
    client = _Client(match=_match("P", "JUNGLE"), timeline={"t": 1})
    assert rl.get_match_timeline(client, "EUW1_1",
                                 target_puuid="P", target_role="MIDDLE") is None
    ok = rl.get_match_timeline(_Client(match=_match("P", "MIDDLE"), timeline={"t": 1}),
                               "EUW1_2")
    assert ok is not None and ok[1] == {"t": 1}
