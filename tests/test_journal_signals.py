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


ITEMS = {
    3094: {"name": "Rapid Firecannon", "cost": 2650, "finished": True},
    3006: {"name": "Berserker's Greaves", "cost": 1100, "finished": False},
    6670: {"name": "Noonquiver", "cost": 1300, "finished": False},
    6672: {"name": "Kraken Slayer", "cost": 3100, "finished": True},
}


def test_classify_visit_separates_a_spike_from_an_ordinary_back():
    """Un back Noonquiver + bottes ne donne aucun spike : ce n'est pas une force."""
    ordinary = S.classify_visit([6670, 3006], ITEMS)
    assert ordinary == {"gold_spent": 2400, "finished_items": [], "is_spike": False}

    spike = S.classify_visit([3094, 3006], ITEMS)
    assert spike == {"gold_spent": 3750,
                     "finished_items": [{"name": "Rapid Firecannon", "cost": 2650}],
                     "is_spike": True}


def test_classify_visit_needs_a_catalog_and_known_items():
    """Sans catalogue, les champs de spike sont simplement absents."""
    assert S.classify_visit([3094], None) is None
    assert S.classify_visit([3094], {}) is None
    assert S.classify_visit([], ITEMS) is None
    assert S.classify_visit([999999], ITEMS) is None


def test_classify_visit_never_exposes_raw_item_ids():
    """`payload._resolve_recall_items` retire les ids bruts de la vue du LLM :
    les reintroduire par `finished_items` annulerait la regle."""
    spike = S.classify_visit([6672], ITEMS)
    assert set(spike["finished_items"][0]) == {"name", "cost"}


def _visit(t_ms, item_ids):
    return {"t_ms": t_ms, "item_ids": list(item_ids)}


def test_opponent_spike_reports_the_closest_finished_enemy_item():
    """Si l'adversaire termine un objet pendant ton back, c'est un mauvais back.
    Asymetrie : les objets adverses sont lisibles au scoreboard en jeu."""
    t0 = 7 * 60000 + 38000                        # 7:38
    visits = [_visit(6 * 60000, [6670]),          # pas de spike
              _visit(7 * 60000 + 52000, [6672]),  # 7:52, +14 s
              _visit(8 * 60000 + 30000, [3094])]  # plus loin
    assert S.opponent_spike(visits, t0, ITEMS) == {
        "clock": "7:52", "delta_s": 14, "items": ["Kraken Slayer"]}


def test_opponent_spike_accepts_a_spike_just_before_my_visit():
    """Un delta negatif dit « avant ma visite » : l'information reste utile."""
    t0 = 8 * 60000
    assert S.opponent_spike([_visit(7 * 60000 + 30000, [6672])], t0,
                            ITEMS)["delta_s"] == -30


def test_opponent_spike_is_none_outside_the_window_or_without_a_spike():
    t0 = 8 * 60000
    assert S.opponent_spike([_visit(5 * 60000, [6672])], t0, ITEMS) is None
    assert S.opponent_spike([_visit(8 * 60000, [6670, 3006])], t0, ITEMS) is None
    assert S.opponent_spike([], t0, ITEMS) is None
    assert S.opponent_spike([_visit(8 * 60000, [6672])], t0, None) is None


def test_death_after_visit_takes_the_first_death_in_the_window():
    """Le retour en lane n'est pas horodate par la timeline : la fenetre de 90 s
    couvre le trajet plus les premieres secondes de lane."""
    t0 = 8 * 60000
    deaths = [7 * 60000, 8 * 60000 + 53000, 8 * 60000 + 80000]
    assert S.death_after_visit(deaths, t0) == {"clock": "8:53", "delta_s": 53}
    assert S.death_after_visit([t0 + 91000], t0) is None
    assert S.death_after_visit([t0], t0) is None, "la mort doit suivre la visite"
    assert S.death_after_visit([], t0) is None
