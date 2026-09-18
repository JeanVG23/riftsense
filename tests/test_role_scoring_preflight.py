"""Le préflight décide avant la collecte profonde."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))
sys.path.insert(0, str(ROOT / "service"))

import role_scoring  # noqa: E402


def _export(role="JUNGLE", model_id="ID1", boundary="diamond", version=1) -> dict:
    return {"schema_version": version, "model_id": model_id, "role": role,
            "boundary": boundary, "features": ["win_rate"], "intercept": 0.0,
            "terms": {"win_rate": {"cuts": [0.5], "scores": [0.0, -0.1, 0.1, 0.0]}},
            "shapes": {"win_rate": {"crossover_value": 0.5}},
            "population": {"low": ["DIAMOND"], "high": ["GRANDMASTER", "CHALLENGER"]}}


def _readiness(role="JUNGLE", model_id="ID1", corpus="production", open_=True) -> dict:
    return {"role": role, "model_id": model_id, "corpus": corpus, "open": open_,
            "auc_ebm": 0.8714, "n_seeds": 10, "margin": 0.0973}


def _ecrire(tmp_path: Path, exports: list[dict], table: list[dict]) -> Path:
    for export in exports:
        (tmp_path / f"{export['role'].lower()}_ebm_export.json").write_text(
            json.dumps(export))
    (tmp_path / "role_readiness.json").write_text(json.dumps(table))
    return tmp_path


def test_un_role_ouvert_et_coherent_est_utilisable(tmp_path):
    models = role_scoring.load_models(_ecrire(tmp_path, [_export()], [_readiness()]))
    assert models["JUNGLE"].reason is None
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) is None


def test_un_role_ferme_rend_role_closed(tmp_path):
    models = role_scoring.load_models(
        _ecrire(tmp_path, [_export()], [_readiness(corpus="research", open_=False)]))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "role_closed"


def test_un_export_absent_rend_model_missing(tmp_path):
    models = role_scoring.load_models(_ecrire(tmp_path, [], [_readiness()]))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "model_missing"


def test_un_model_id_discordant_rend_model_mismatch(tmp_path):
    models = role_scoring.load_models(
        _ecrire(tmp_path, [_export(model_id="ID1")], [_readiness(model_id="ID2")]))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "model_mismatch"


def test_une_frontiere_discordante_rend_model_mismatch(tmp_path):
    table = [{**_readiness(), "boundary": "master"}]
    models = role_scoring.load_models(_ecrire(tmp_path, [_export()], table))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "model_mismatch"


def test_une_version_de_schema_inconnue_rend_model_mismatch(tmp_path):
    models = role_scoring.load_models(
        _ecrire(tmp_path, [_export(version=99)], [_readiness()]))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "model_mismatch"


@pytest.mark.parametrize("tier", ["PLATINUM", "EMERALD", "GOLD", None])
def test_sous_diamant_rend_rank_out_of_scope(tmp_path, tier):
    models = role_scoring.load_models(_ecrire(tmp_path, [_export()], [_readiness()]))
    assert role_scoring.preflight_eligibility("JUNGLE", tier, models) == "rank_out_of_scope"


@pytest.mark.parametrize("tier", ["DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"])
def test_diamant_et_au_dessus_sont_couverts(tmp_path, tier):
    models = role_scoring.load_models(_ecrire(tmp_path, [_export()], [_readiness()]))
    assert role_scoring.preflight_eligibility("JUNGLE", tier, models) is None


def test_un_defaut_d_artefact_prime_sur_un_role_ferme(tmp_path):
    models = role_scoring.load_models(
        _ecrire(tmp_path, [], [_readiness(corpus="research", open_=False)]))
    assert role_scoring.preflight_eligibility("JUNGLE", "DIAMOND", models) == "model_missing"
