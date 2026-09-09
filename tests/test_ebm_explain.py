"""Tests du moteur d'analyse EBM sur un stub : zéro dépendance interpret,
zéro modèle sur disque. Le stub reproduit STRICTEMENT l'API interpret consommée
(term_names_, explain_global().data(i), explain_local()._internal_obj["specific"])
: si l'API réelle diverge un jour, c'est le run réel qui le révélera, pas ces
tests."""
from __future__ import annotations

import numpy as np
import pandas as pd

import ebm_explain as ee


class _Global:
    def __init__(self, shapes):
        self._shapes = shapes

    def data(self, i):
        return self._shapes[i]


class _Local:
    def __init__(self, rows):
        self._rows = rows

    @property
    def _internal_obj(self):
        return {"specific": self._rows}


class FakeEBM:
    """Stub minimal : shape functions par terme + contributions par row."""

    def __init__(self, term_names, shapes, local_rows):
        self.term_names_ = term_names
        self._shapes = shapes
        self._local = local_rows

    def explain_global(self):
        return _Global(self._shapes)

    def explain_local(self, X):
        del X
        return _Local(self._local)


def _mono_ebm():
    """Shape gd10 monotone croissante qui bascule de signe à mid=125."""
    return FakeEBM(
        term_names=["gd10", "dpm"],
        shapes=[
            {"names": [0, 50, 100, 150, 200], "scores": [-0.8, -0.2, 0.1, 0.6]},
            {"names": [0, 50, 100], "scores": [0.0, 0.0, 0.0]},
        ],
        local_rows=[{"names": ["gd10", "dpm", "gd10 & dpm"],
                     "scores": [-0.5, 0.2, 0.05]}],
    )


def test_levels_registry_declares_both_roles():
    assert set(ee.LEVELS) == {"player", "game"}
    assert ee.LEVELS["player"]["features_file"] == "player_features.json"
    assert ee.LEVELS["player"]["source"] is None
    assert ee.LEVELS["player"]["interactions"] is False
    assert ee.LEVELS["game"]["source"] == "referentiel"
    assert ee.LEVELS["game"]["ranks"] == ["diamond", "challenger"]
    assert ee.LEVELS["game"]["interactions"] is True


def test_term_index_finds_main_effect_only():
    ebm = _mono_ebm()
    assert ee.term_index(ebm, "gd10") == 0
    assert ee.term_index(ebm, "nope") is None


def test_shape_summary_detects_crossover_direction_and_core_range():
    ebm = _mono_ebm()
    vals = pd.Series([10.0, 90.0, 160.0, 190.0])   # p5=22.0, p95=185.5
    s = ee.shape_summary(ebm, 0, vals, neg="diamond", pos="challenger")
    assert s["swing_logodds"] == 1.4
    assert s["monotonic_rho"] == 1.0
    assert s["score_low"] == -0.8
    assert s["score_high"] == 0.6
    assert s["crossover_value"] == 125.0     # 1re valeur de mid qui croise 0
    assert s["direction"] == "valeur haute → challenger"
    assert s["core_range"] == [22.0, 185.5]  # cœur [p5, p95] des vals


def test_shape_summary_falls_back_to_all_bins_without_data():
    ebm = _mono_ebm()
    s = ee.shape_summary(ebm, 0, pd.Series([], dtype=float),
                         neg="diamond", pos="challenger")
    assert s["core_range"] == [25.0, 175.0]   # fallback mids[0], mids[-1]
    assert s["swing_logodds"] == 1.4


def test_shape_summary_direction_negative_when_decreasing():
    ebm = FakeEBM(
        term_names=["dpm"],
        shapes=[{"names": [0, 10, 20, 30, 40], "scores": [0.3, 0.1, -0.5, -0.9]}],
        local_rows=[],
    )
    s = ee.shape_summary(ebm, 0, pd.Series([2.0, 18.0]),
                         neg="diamond", pos="challenger")
    assert s["direction"] == "valeur haute → diamond"


def test_term_contributions_orders_on_features_and_defaults_missing():
    ebm = _mono_ebm()   # row : gd10=-0.5, dpm=0.2, interaction 0.05
    X = pd.DataFrame([{"gd10": 100.0, "dpm": 50.0}])
    out = ee.term_contributions(ebm, X, ["gd10", "dpm", "absent_feature"])
    assert out.shape == (1, 3)
    assert out[0].tolist() == [-0.5, 0.2, 0.0]   # interaction ignorée, absent -> 0.0


def test_explain_player_row_returns_all_features_signed():
    ebm = _mono_ebm()
    drivers = ee.explain_player_row(ebm, {"gd10": 100.0, "dpm": 50.0},
                                    ["gd10", "dpm"])
    assert drivers == [{"feature": "gd10", "contribution": -0.5},
                       {"feature": "dpm", "contribution": 0.2}]


def test_top_drivers_sorts_by_abs_and_keeps_sign():
    rows = [{"feature": "a", "contribution": 0.1},
            {"feature": "b", "contribution": -0.9},
            {"feature": "c", "contribution": 0.5},
            {"feature": "d", "contribution": -0.3}]
    assert ee.top_drivers(rows, n=2) == [
        {"feature": "b", "contribution": -0.9},
        {"feature": "c", "contribution": 0.5},
    ]


def test_crosscheck_constant_column_spearman_is_zero_not_nan(monkeypatch):
    """Colonne constante (features __p10 quasi constantes du smoke player) ->
    spearmanr scipy renvoie NaN : coercé en 0.0 comme le fait déjà shape_summary
    sur des scores constants, jamais sérialisé NaN en JSON (9 cas réels vus)."""
    X = pd.DataFrame({"flat": [0.0, 0.0, 0.0, 0.0], "wave": [1.0, 2.0, 3.0, 4.0]})
    ebm_contribs = np.array([[0.0, 0.1], [0.0, -0.2], [0.0, 0.3], [0.0, -0.4]])
    sv = np.array([[0.0, 0.5], [0.0, 0.1], [0.0, -0.3], [0.0, -0.6]])
    monkeypatch.setattr(ee, "tree_shap_values", lambda model, X: sv)
    rows, sv_vals = ee.crosscheck({"xgb": object(), "rf": object()}, X,
                                  ["flat", "wave"], ebm_contribs)
    flat = next(r for r in rows if r["feature"] == "flat")
    wave = next(r for r in rows if r["feature"] == "wave")
    assert flat["spearman"] == 0.0     # NaN != 0.0 : ce assert échouerait sur NaN
    assert np.isfinite(wave["spearman"])   # la feature variée reste calculée telle quelle
    assert sv_vals.shape == (4, 2)     # moyenne des deux modèles stubés, brute


def test_shape_summary_refuses_to_rank_a_constant_column():
    """Colonne constante = aucun contraste dans la population : les bins que l'EBM
    a quand meme appris ne decrivent que du binning. On refuse de la ranger (swing 0
    -> bas du tri prescriptif) et on dit pourquoi, plutot que de livrer un seuil de
    bascule indistinguable d'un vrai (9 features __p10 du niveau player)."""
    ebm = _mono_ebm()
    s = ee.shape_summary(ebm, 0, pd.Series([3.0, 3.0, 3.0]),
                         neg="diamond", pos="challenger")
    assert s["degenerate"] == "constant"
    assert s["swing_logodds"] == 0.0
    assert s["crossover_value"] is None
    assert s["direction"] == "indéterminé (colonne constante)"
    assert s["core_range"] == [3.0, 3.0]


def test_shape_summary_flags_core_narrower_than_a_bin():
    """[p5, p95] plus etroit qu'un bin : le repli sur tous les bins reste, mais il
    est declare (sinon un resume bruite passe pour un resume mesure)."""
    ebm = _mono_ebm()
    s = ee.shape_summary(ebm, 0, pd.Series([100.0, 100.5, 101.0]),
                         neg="diamond", pos="challenger")
    assert s["degenerate"] == "core_hors_bins"


def test_shape_summary_healthy_column_is_not_flagged():
    ebm = _mono_ebm()
    s = ee.shape_summary(ebm, 0, pd.Series([10.0, 90.0, 160.0, 190.0]),
                         neg="diamond", pos="challenger")
    assert s["degenerate"] is None


def test_crosscheck_flags_non_measurable_spearman(monkeypatch):
    """0.0 « non mesurable » vs 0.0 mesure : sans le drapeau, une feature dont
    l'EBM ne dit rien serait indistinguable d'une feature ou EBM et arbres se
    contredisent."""
    X = pd.DataFrame({"flat": [0.0, 0.0, 0.0, 0.0], "wave": [1.0, 2.0, 3.0, 4.0]})
    ebm_contribs = np.array([[0.0, 0.1], [0.0, -0.2], [0.0, 0.3], [0.0, -0.4]])
    sv = np.array([[0.0, 0.5], [0.0, 0.1], [0.0, -0.3], [0.0, -0.6]])
    monkeypatch.setattr(ee, "tree_shap_values", lambda model, X: sv)
    rows, _ = ee.crosscheck({"xgb": object(), "rf": object()}, X,
                            ["flat", "wave"], ebm_contribs)
    by_f = {r["feature"]: r for r in rows}
    assert by_f["flat"]["spearman"] == 0.0
    assert by_f["flat"]["degenerate"] == "non_mesurable"
    assert by_f["wave"]["degenerate"] is None
