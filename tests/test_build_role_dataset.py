"""build_dataset paramétré par rôle. Le rang n'est plus transféré au niveau
per-game : il est porté par la fenêtre joueur, seule unité que le modèle apprend."""
import importlib.util
import sys
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "build_dataset", Path("src/01_data_engineering/build_dataset.py"))
bd = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bd)


def _match(roles):
    """roles : liste de 10 teamPosition, dans l'ordre des participants."""
    return {
        "metadata": {"participants": [f"p{i}" for i in range(len(roles))]},
        "info": {"participants": [{"teamPosition": r} for r in roles]},
    }


def test_role_puuids_rend_les_deux_joueurs_du_role():
    match = _match(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] * 2)
    assert bd.role_puuids(match, "JUNGLE") == ["p1", "p6"]
    assert bd.role_puuids(match, "SUPPORT") == ["p4", "p9"]


def test_role_puuids_vide_si_le_role_est_absent():
    match = _match(["TOP"] * 10)
    assert bd.role_puuids(match, "JUNGLE") == []


@pytest.mark.parametrize("role", ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT"])
def test_role_puuids_couvre_les_cinq_roles(role):
    match = _match(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] * 2)
    assert len(bd.role_puuids(match, role)) == 2


def test_dataset_path_depend_du_role():
    assert bd.dataset_path("JUNGLE").name == "jungle_dataset.parquet"
    assert bd.dataset_path("BOTTOM").name == "bottom_dataset.parquet"
    assert bd.dataset_path("SUPPORT").name == "support_dataset.parquet"
    assert bd.dataset_path("UTILITY").name == "support_dataset.parquet"


def test_role_puuids_accepte_l_ancien_alias_utility():
    match = _match(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] * 2)
    assert bd.role_puuids(match, "UTILITY") == ["p4", "p9"]


def test_main_sans_role_preserve_le_pipeline_adc_historique(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["build_dataset.py"])
    monkeypatch.setattr(bd, "_legacy_adc_main", lambda: 17)
    assert bd.main() == 17


def test_main_avec_role_utilise_le_nouveau_chemin(monkeypatch):
    seen = []
    monkeypatch.setattr(sys, "argv", ["build_dataset.py", "--role", "jungle"])
    monkeypatch.setattr(bd, "_role_dataset_main",
                        lambda role: seen.append(role) or 0)
    assert bd.main() == 0
    assert seen == ["JUNGLE"]


def test_main_normalise_l_alias_riot_utility(monkeypatch):
    seen = []
    monkeypatch.setattr(sys, "argv", ["build_dataset.py", "--role", "utility"])
    monkeypatch.setattr(bd, "_role_dataset_main",
                        lambda role: seen.append(role) or 0)
    assert bd.main() == 0
    assert seen == ["SUPPORT"]
