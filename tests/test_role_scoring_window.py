"""La fenêtre servie doit être celle qui a été apprise."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))
sys.path.insert(0, str(ROOT / "service"))

import game_rows  # noqa: E402
import ml_features as mf  # noqa: E402
import riotlib as rl  # noqa: E402
import role_features as rf  # noqa: E402
import role_scoring  # noqa: E402

FIXTURE_RAW = ROOT / "tests" / "fixtures" / "demo" / "01_raw"


@pytest.fixture(scope="module")
def records_silver() -> list[dict]:
    """Records silver imbriqués, extraits du raw comme en production."""
    out = []
    for path in sorted(FIXTURE_RAW.glob("*_match.json.zst")):
        match_id = path.name.split("_match")[0]
        match = rl._read_raw_at(path)
        timeline = rl._read_raw_at(FIXTURE_RAW / f"{match_id}_timeline.json.zst")
        for puuid in match["metadata"]["participants"]:
            game = rl.extract_game(match, timeline, puuid)
            if game:
                out.append(game)
    assert out, "les fixtures doivent produire des records silver"
    return out


def _role_le_plus_fourni(records: list[dict]) -> tuple[str, str]:
    counts: dict[tuple[str, str], int] = {}
    for record in records:
        raw = record.get("role")
        if not raw:
            continue
        role = rf.normalize_role(raw)
        if role not in rf.ROLES:
            continue
        key = (record["puuid"], role)
        counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get)


def test_la_fenetre_reproduit_l_agregation_d_entrainement(records_silver):
    puuid, role = _role_le_plus_fourni(records_silver)
    mine = [record for record in records_silver
            if record["puuid"] == puuid
            and rf.normalize_role(record.get("role") or "") == role]
    n = len(mine)

    window = role_scoring.build_window(mine, role, n)
    frame = pd.DataFrame([game_rows.game_to_row(record) for record in mine])
    frame = frame.sort_values("game_ts", ascending=False).head(n)
    attendu = mf.aggregate_player_features(frame, rf.ROLE_FEATURES[role])
    attendu.pop("n_games", None)

    assert set(window) == set(attendu)
    for name, value in attendu.items():
        got = window[name]
        if isinstance(value, float) and math.isnan(value):
            assert math.isnan(got), name
        else:
            assert got == pytest.approx(value, abs=1e-12), name


def test_la_fenetre_n_est_pas_entierement_vide(records_silver):
    puuid, role = _role_le_plus_fourni(records_silver)
    mine = [record for record in records_silver
            if record["puuid"] == puuid
            and rf.normalize_role(record.get("role") or "") == role]
    window = role_scoring.build_window(mine, role, len(mine))
    renseignees = [value for value in window.values()
                   if not (isinstance(value, float) and math.isnan(value))]
    assert len(renseignees) > len(window) // 2


def test_la_fenetre_prend_les_plus_recentes(records_silver):
    puuid, role = _role_le_plus_fourni(records_silver)
    mine = [record for record in records_silver
            if record["puuid"] == puuid
            and rf.normalize_role(record.get("role") or "") == role]
    assert len(mine) >= 2
    recentes = role_scoring.role_games(mine, role)
    assert [record["game_ts"] for record in recentes] == sorted(
        (record["game_ts"] for record in mine), reverse=True)


def test_le_role_dominant_ignore_les_parties_sans_role(records_silver):
    games = [{"role": "JUNGLE"}, {"role": "JUNGLE"},
             {"role": "MIDDLE"}, {"role": None}]
    assert role_scoring.dominant_role(games) == "JUNGLE"
    assert role_scoring.dominant_role([{"role": None}]) is None


def test_le_payload_publie_la_decomposition_complete_et_verifiable():
    export = {"schema_version": 1, "model_id": "ID1", "role": "JUNGLE",
              "boundary": "diamond", "features": ["win_rate", "n_deaths__mean"],
              "intercept": 0.2,
              "terms": {"win_rate": {"cuts": [0.5], "scores": [0.0, -0.3, 0.4, 0.0]},
                        "n_deaths__mean": {"cuts": [3.0],
                                            "scores": [0.0, 0.1, -0.2, 0.0]}},
              "shapes": {"win_rate": {"crossover_value": 0.5,
                                        "direction": "plus haut est mieux"},
                         "n_deaths__mean": {"crossover_value": 3.0,
                                             "direction": "plus bas est mieux"}},
              "population": {"low": ["DIAMOND"],
                             "high": ["GRANDMASTER", "CHALLENGER"]}}
    readiness = {"role": "JUNGLE", "model_id": "ID1", "corpus": "production",
                 "open": True, "auc_ebm": 0.8714, "n_seeds": 10}
    model = role_scoring.RoleModel(export, readiness, None)
    window = {"win_rate": 0.6, "n_deaths__mean": 2.0}

    payload = role_scoring.score(model, window, {"role_games_used": 20})

    assert payload["available"] is True
    assert payload["role"] == "JUNGLE"
    assert [driver["feature"] for driver in payload["drivers"]] == [
        "win_rate", "n_deaths__mean"]
    assert payload["drivers"][0]["contribution"] == pytest.approx(0.4)
    assert payload["drivers"][0]["value"] == 0.6
    assert payload["drivers"][0]["crossover_value"] == 0.5
    assert payload["drivers"][0]["base"] == "win_rate"
    assert payload["drivers"][1]["base"] == "n_deaths"
    total = payload["intercept"] + sum(
        driver["contribution"] for driver in payload["drivers"])
    assert total == pytest.approx(payload["logit"])
    assert "probability" not in payload


def test_un_proxy_cache_dans_le_payload_fait_echouer_la_publication():
    proxy = sorted(rf.HIDDEN_ML_ONLY)[0]
    colonne = f"{proxy}__mean"
    export = {"schema_version": 1, "model_id": "ID1", "role": "TOP",
              "boundary": "diamond", "features": [colonne], "intercept": 0.0,
              "terms": {colonne: {"cuts": [], "scores": [0.0, 0.1, 0.0]}},
              "shapes": {}, "population": {"low": [], "high": []}}
    model = role_scoring.RoleModel(
        export, {"role": "TOP", "model_id": "ID1", "corpus": "production",
                 "open": True}, None)
    with pytest.raises(AssertionError, match="HIDDEN_ML_ONLY"):
        role_scoring.score(model, {colonne: 1.0}, {})


def test_les_drivers_sont_tries_par_poids_absolu_decroissant():
    export = {"schema_version": 1, "model_id": "ID1", "role": "TOP",
              "boundary": "diamond", "features": ["a", "b", "c"], "intercept": 0.0,
              "terms": {"a": {"cuts": [], "scores": [0.0, 0.1, 0.0]},
                        "b": {"cuts": [], "scores": [0.0, -0.9, 0.0]},
                        "c": {"cuts": [], "scores": [0.0, 0.5, 0.0]}},
              "shapes": {}, "population": {"low": [], "high": []}}
    model = role_scoring.RoleModel(
        export, {"role": "TOP", "model_id": "ID1", "corpus": "production",
                 "open": True}, None)
    payload = role_scoring.score(model, {"a": 1.0, "b": 1.0, "c": 1.0}, {})
    assert [driver["feature"] for driver in payload["drivers"]] == ["b", "c", "a"]
