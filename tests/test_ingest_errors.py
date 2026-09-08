"""Codes d'erreur dérivés du TYPE de l'exception, jamais du texte du message.

Même règle que RawMissing/BenchmarkMissing dans game_coach.ts : un message est
écrit pour un humain et se réécrit sans y penser, un type se renomme sous le
contrôle du compilateur et des tests.
"""
from __future__ import annotations

import errors


def test_chaque_erreur_porte_son_code():
    assert errors.RiotIdNotFound().code == "riot_id_not_found"
    assert errors.NoRankedGames().code == "no_ranked_games"
    assert errors.RiotUnavailable().code == "riot_unavailable"


def test_error_code_of_rabat_l_inconnu_sur_internal():
    assert errors.error_code_of(errors.RiotIdNotFound("texte libre")) == "riot_id_not_found"
    assert errors.error_code_of(ValueError("boom")) == "internal"


def test_le_code_ne_depend_pas_du_message():
    assert errors.error_code_of(errors.NoRankedGames("aucune partie")) == "no_ranked_games"
    assert errors.error_code_of(errors.NoRankedGames("")) == "no_ranked_games"
