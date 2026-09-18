"""L'export JSON d'un EBM doit rendre EXACTEMENT ce que rend le modèle.

C'est le test qui porte toute la décision d'exporter plutôt que d'embarquer le
pickle : s'il est affaibli, l'approche n'a plus de justification. Les lignes
ordinaires ne suffisent pas, une erreur de convention sur une borne y est
invisible ; d'où les sondes posées sur chaque cut, juste avant et juste après.

L'EBM est entraîné ICI, minuscule et synthétique : les artefacts réels sont
gitignorés et un clone frais n'en a aucun. La parité sur les cinq modèles servis est
vérifiée par `make verify-exports`, prérequis de build.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src" / "core"))

import ebm_lookup  # noqa: E402

FEATURES = ["a", "b", "c"]


@pytest.fixture(scope="module")
def modele():
    """EBM binaire sur trois colonnes continues, dont une avec des trous."""
    from interpret.glassbox import ExplainableBoostingClassifier

    rng = np.random.default_rng(42)
    n = 400
    X = pd.DataFrame({
        "a": rng.normal(size=n),
        "b": rng.uniform(0, 10, size=n),
        "c": rng.normal(size=n),
    })
    X.loc[X.index[:40], "c"] = np.nan
    y = (X["a"] + 0.3 * X["b"] > 1.0).astype(int)
    ebm = ExplainableBoostingClassifier(interactions=0, random_state=42)
    ebm.fit(X[FEATURES], y)
    return ebm, X[FEATURES]


@pytest.fixture(scope="module")
def export(modele):
    ebm, _ = modele
    return ebm_lookup.export_model(
        ebm, FEATURES, role="MIDDLE", boundary="diamond",
        population={"low": ["DIAMOND"], "high": ["GRANDMASTER", "CHALLENGER"]},
        shapes={f: {"crossover_value": None} for f in FEATURES})


def _reference(ebm, frame):
    return np.asarray(ebm.eval_terms(frame))


def test_les_contributions_egalent_eval_terms_sur_des_lignes_ordinaires(modele, export):
    ebm, X = modele
    frame = X.head(50)
    ref = _reference(ebm, frame)
    for k in range(len(frame)):
        got = ebm_lookup.contributions(export, frame.iloc[k].to_dict())
        for j, name in enumerate(FEATURES):
            assert got[name] == pytest.approx(ref[k][j], abs=1e-12)


def test_les_bornes_exactes_et_leurs_voisines_tombent_dans_le_bon_bin(modele, export):
    ebm, X = modele
    base = X.head(1).copy()
    for j, name in enumerate(FEATURES):
        cuts = np.asarray(ebm.bins_[j][0], dtype=float)
        for cut in cuts:
            for value in (cut, np.nextafter(cut, -np.inf), np.nextafter(cut, np.inf)):
                probe = base.copy()
                probe.iloc[0, probe.columns.get_loc(name)] = value
                ref = float(_reference(ebm, probe)[0][j])
                got = ebm_lookup.contributions(export, probe.iloc[0].to_dict())[name]
                assert got == pytest.approx(ref, abs=1e-12), f"{name} à {value}"


def test_les_valeurs_manquantes_et_infinies_suivent_le_modele(modele, export):
    ebm, X = modele
    base = X.head(1).copy()
    for value in (np.nan, np.inf, -np.inf):
        probe = base.copy()
        probe.iloc[0, probe.columns.get_loc("c")] = value
        ref = float(_reference(ebm, probe)[0][2])
        got = ebm_lookup.contributions(export, probe.iloc[0].to_dict())["c"]
        assert got == pytest.approx(ref, abs=1e-12), f"c à {value}"


def test_le_logit_total_reproduit_predict_proba(modele, export):
    ebm, X = modele
    frame = X.head(50)
    attendu = ebm.predict_proba(frame)[:, 1]
    for k in range(len(frame)):
        logit = ebm_lookup.logit(export, frame.iloc[k].to_dict())
        assert 1.0 / (1.0 + math.exp(-logit)) == pytest.approx(attendu[k], abs=1e-9)


def test_la_somme_des_contributions_plus_l_intercept_vaut_le_logit(modele, export):
    _, X = modele
    row = X.iloc[0].to_dict()
    total = sum(ebm_lookup.contributions(export, row).values()) + export["intercept"]
    assert total == pytest.approx(ebm_lookup.logit(export, row), abs=1e-12)


def test_l_export_est_du_json_strict(export):
    # NaN et Infinity ne sont pas du JSON : un parseur strict les refuse.
    json.dumps(export, allow_nan=False)


def test_une_borne_non_finie_fait_echouer_l_export_au_lieu_de_passer(modele):
    ebm, _ = modele
    original = ebm.bins_[0][0]
    ebm.bins_[0][0] = np.array([0.0, np.inf])
    try:
        with pytest.raises(ValueError, match="non fini"):
            ebm_lookup.export_model(
                ebm, FEATURES, role="MIDDLE", boundary="diamond",
                population={"low": [], "high": []}, shapes={})
    finally:
        ebm.bins_[0][0] = original


def test_le_model_id_change_avec_le_modele(modele, export):
    autre = dict(export, intercept=export["intercept"] + 1.0)
    assert ebm_lookup.compute_model_id(autre) != export["model_id"]
