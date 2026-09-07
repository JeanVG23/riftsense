"""Dérivations pures du journal : recalls, spike adverse, tracking, contexte allié.

Chaque test fabrique le minimum de timeline nécessaire : ces fonctions sont
pures et duck-typées, elles n'ont jamais besoin d'une game complète.
"""
import journal_signals as S


def _pf(cs=0, jungle_cs=0, x=13000, y=2000, level=5,
        gold_total=1000, gold_current=200):
    return {"minionsKilled": cs, "jungleMinionsKilled": jungle_cs,
            "level": level, "totalGold": gold_total, "currentGold": gold_current,
            "position": {"x": x, "y": y}}


def _frames(values):
    """{minute: participantFrame} depuis {minute: cs}."""
    return {minute: _pf(cs=cs) for minute, cs in values.items()}


def test_cs_of_sums_lane_and_jungle_creeps():
    assert S.cs_of(_pf(cs=40, jungle_cs=6)) == 46
    assert S.cs_of({}) == 0


def test_cs_baseline_is_the_median_of_clean_minute_deltas():
    """8 cs/min sur deux minutes propres, une minute contaminee ecartee."""
    frames = _frames({0: 0, 1: 8, 2: 10, 3: 12, 4: 20})
    # Minute 2 contaminee (mort ou recall) : le delta 1->2 (=2) ET le delta
    # 2->3 (=2) sont ecartes, la fenetre etant a cheval sur l'evenement.
    # Restent les deux deltas propres (0->1 et 3->4), a 8 chacun.
    assert S.cs_baseline(frames, skip={2}) == 8
    # Sans exclusion, les deux deltas contamines (=2) tirent la mediane vers
    # le bas : la ligne de base est contaminee par l'evenement mesure.
    assert S.cs_baseline(frames, skip=set()) < 8


def test_cs_baseline_is_none_without_a_clean_delta():
    assert S.cs_baseline(_frames({0: 0}), skip=set()) is None
    assert S.cs_baseline({}, skip=set()) is None


def test_recall_cs_cost_measures_the_window_and_carries_its_precision():
    """Fenetre de la frame a ou avant la visite jusqu'a +2 minutes (120 s)."""
    mine = _frames({7: 60, 8: 66, 9: 71})
    opp = _frames({7: 62, 8: 70, 9: 79})
    cost = S.recall_cs_cost(mine, opp, t0=7 * 60000 + 30000, baseline=8.4)
    assert cost == {
        "window": {"from": "7:00", "to": "9:00"},
        "my_cs_gained": 11,
        "expected_cs": 16.8,
        "cs_missed_est": {"value": 6, "precision_cs": 2},
        "opp_cs_gained": 17,
        "cs_diff_swing": -6,
    }


def test_recall_cs_cost_never_reports_a_negative_loss():
    """Prendre plus que sa ligne de base n'est pas une perte negative."""
    mine = _frames({7: 60, 8: 70, 9: 82})
    opp = _frames({7: 60, 8: 66, 9: 72})
    cost = S.recall_cs_cost(mine, opp, t0=7 * 60000, baseline=8.0)
    assert cost["cs_missed_est"]["value"] == 0
    assert cost["cs_diff_swing"] == 10


def test_recall_cs_cost_omits_the_block_at_the_end_of_the_game():
    """Moins de deux frames completes apres la visite : rien a mesurer."""
    mine = _frames({7: 60, 8: 66})
    opp = _frames({7: 62, 8: 70})
    assert S.recall_cs_cost(mine, opp, t0=7 * 60000, baseline=8.0) is None


def test_recall_cs_cost_omits_the_block_without_a_resolved_opponent():
    mine = _frames({7: 60, 8: 66, 9: 71})
    assert S.recall_cs_cost(mine, {}, t0=7 * 60000, baseline=8.0) is None
    assert S.recall_cs_cost(mine, _frames({7: 1, 8: 2, 9: 3}),
                            t0=7 * 60000, baseline=None) is None
