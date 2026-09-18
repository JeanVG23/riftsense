"""Tests de ml_rank.player_aggregate : extraction publique du bloc d'agrégation
de predict_rank (le sync l'appelle pour expliquer la prédiction publiée avec la
même ligne de features). Construction de rows mockée : on teste le câblage
(filtre ADC, seuil MIN_ADC_GAMES), pas pandas."""
from __future__ import annotations

import ml_rank


def _mock_rows(monkeypatch):
    """game_to_row -> une row à une seule feature ; l'agrégat mocké somme les
    rows reçues : si le filtre ADC laissait passer une game non-BOTTOM, la somme
    trahirait la fuite."""
    monkeypatch.setattr(ml_rank.game_rows, "game_to_row",
                        lambda g, rank, source: {"f": g["i"]})
    monkeypatch.setattr(ml_rank.mf, "aggregate_player_features",
                        lambda rows, feats: {"f__mean": float(rows["f"].sum())})


def test_player_aggregate_returns_agg_and_adc_count(monkeypatch):
    _mock_rows(monkeypatch)
    games = [{"role": "BOTTOM", "i": float(n)} for n in range(ml_rank.MIN_ADC_GAMES)]
    agg, n = ml_rank.player_aggregate(games)
    assert n == ml_rank.MIN_ADC_GAMES
    assert agg == {"f__mean": float(sum(range(ml_rank.MIN_ADC_GAMES)))}


def test_player_aggregate_drops_non_adc_roles(monkeypatch):
    _mock_rows(monkeypatch)
    games = ([{"role": "BOTTOM", "i": float(n)} for n in range(ml_rank.MIN_ADC_GAMES)]
             + [{"role": "TOP", "i": 100.0} for _ in range(5)])
    agg, n = ml_rank.player_aggregate(games)
    assert n == ml_rank.MIN_ADC_GAMES
    assert agg == {"f__mean": float(sum(range(ml_rank.MIN_ADC_GAMES)))}  # pas de 100


def test_player_aggregate_none_below_min(monkeypatch):
    def _fail(*args, **kwargs):
        raise AssertionError("game_to_row ne doit pas être appelé sous le seuil")
    monkeypatch.setattr(ml_rank.game_rows, "game_to_row", _fail)
    games = [{"role": "BOTTOM", "i": float(n)}
             for n in range(ml_rank.MIN_ADC_GAMES - 1)]
    assert ml_rank.player_aggregate(games) is None
