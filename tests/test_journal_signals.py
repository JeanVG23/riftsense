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


class _FakeTimeline:
    """Duck-typing de `game_journal._Timeline` : seule `events_between` est lue."""

    def __init__(self, events):
        self.events = sorted(events, key=lambda ev: ev["timestamp"])

    def events_between(self, t0, t1):
        return [ev for ev in self.events if t0 < ev["timestamp"] <= t1]

    def frame_before(self, t_ms):
        return getattr(self, "frame", None)


JUNGLE = 10          # pid du jungler ennemi
BOT_XY = {"x": 13000, "y": 2000}
TOP_XY = {"x": 2000, "y": 13000}


def _kill(t_ms, victim, killer, assists=(), pos=None):
    return {"type": "CHAMPION_KILL", "timestamp": t_ms, "victimId": victim,
            "killerId": killer, "assistingParticipantIds": list(assists),
            "position": dict(pos or BOT_XY)}


def test_jungle_signals_reads_the_last_public_clue():
    tl = _FakeTimeline([
        _kill(4 * 60000, victim=3, killer=JUNGLE, pos=BOT_XY),
        _kill(8 * 60000 + 12000, victim=4, killer=JUNGLE, pos=TOP_XY),
    ])
    out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=8 * 60000 + 52000,
                           death_zone="BOT")
    assert out == {"champion": "Vi", "age_s": 40,
                   "last": {"type": "CHAMPION_KILL", "clock": "8:12",
                            "zone": "TOP", "same_side_as_death": False}}


def test_jungle_signals_counts_the_death_of_the_jungler_as_a_clue():
    """Le kill feed l'annonce, et un jungler mort ne peut pas ganker."""
    tl = _FakeTimeline([_kill(7 * 60000, victim=JUNGLE, killer=2, pos=TOP_XY)])
    out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=7 * 60000 + 30000,
                           death_zone="TOP")
    assert out["last"]["type"] == "CHAMPION_KILL"
    assert out["last"]["same_side_as_death"] is True
    assert out["age_s"] == 30


def test_jungle_signals_accepts_objectives_and_buildings_of_his_hand():
    for etype, extra in (("ELITE_MONSTER_KILL", {"monsterType": "DRAGON"}),
                         ("BUILDING_KILL", {"towerType": "OUTER_TURRET"}),
                         ("TURRET_PLATE_DESTROYED", {})):
        tl = _FakeTimeline([{"type": etype, "timestamp": 6 * 60000,
                             "killerId": JUNGLE, "position": dict(BOT_XY),
                             **extra}])
        out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=6 * 60000 + 10000,
                               death_zone="BOT")
        assert out["last"]["type"] == etype, etype


def test_jungle_signals_excludes_ward_kills_and_private_events():
    """`WARD_KILL` est invisible hors vision : l'admettre casserait l'asymetrie."""
    tl = _FakeTimeline([
        {"type": "WARD_KILL", "timestamp": 8 * 60000, "killerId": JUNGLE,
         "position": dict(BOT_XY)},
        {"type": "LEVEL_UP", "timestamp": 8 * 60000 + 10000, "participantId": JUNGLE},
        {"type": "ITEM_PURCHASED", "timestamp": 8 * 60000 + 20000,
         "participantId": JUNGLE, "itemId": 1055},
    ])
    out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=9 * 60000, death_zone="BOT")
    assert out["last"] is None
    # Aucun indice : l'age compte depuis le debut de la partie.
    assert out["age_s"] == 540


def test_jungle_signals_ignores_the_death_being_analysed():
    """Le gank lui-meme n'est pas un indice prealable : sinon age_s = 0 toujours."""
    t_death = 9 * 60000
    tl = _FakeTimeline([_kill(t_death, victim=1, killer=JUNGLE),
                        _kill(6 * 60000, victim=3, killer=JUNGLE)])
    out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=t_death, death_zone="BOT")
    assert out["last"]["clock"] == "6:00"
    assert out["age_s"] == 180


def test_jungle_signals_is_none_without_a_resolved_jungler():
    assert S.jungle_signals(_FakeTimeline([]), None, None, 60000, "BOT") is None


def test_jungle_signals_never_duplicates_the_age():
    """`age_s` vit au niveau du bloc uniquement : le dupliquer dans `last`
    exposerait deux valeurs que le LLM pourrait croire contradictoires."""
    tl = _FakeTimeline([_kill(4 * 60000, victim=3, killer=JUNGLE)])
    out = S.jungle_signals(tl, JUNGLE, "Vi", t_ms=5 * 60000, death_zone="BOT")
    assert "age_s" not in out["last"]


TABLE = [
    {"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET", "x": 10504, "y": 1029},
    {"team": 100, "lane": "BOT_LANE", "tier": "INNER_TURRET", "x": 6919, "y": 1483},
    {"team": 200, "lane": "BOT_LANE", "tier": "OUTER_TURRET", "x": 13866, "y": 4505},
]


def _support_frames(zones):
    """{minute: participantFrame} depuis {minute: (x, y)}."""
    return {minute: _pf(x=xy[0], y=xy[1]) for minute, xy in zones.items()}


def test_ally_context_reports_the_support_and_the_standing_turret():
    """Valeurs verifiees a la main sur la table reelle : moi en (13000, 1500),
    zone BOT, profondeur signee -301 ; le support est parti TOP."""
    support = _support_frames({6: (13200, 1800), 7: (2000, 13000),
                               8: (2000, 13000)})
    out = S.ally_context(support, my_team=100, role="BOTTOM",
                         t_ms=8 * 60000 + 31000, my_pos=(13000, 1500),
                         my_zone="BOT", destroyed=set(), table=TABLE)
    assert out["support"]["zone"] == "TOP"
    assert out["support"]["distance"] == 15914
    # Dernier passage du support dans ma zone : frame 6:00, mort a 8:31 = 151 s.
    assert out["support"]["away_from_my_zone_s"] == 151
    assert out["nearest_friendly_turret"] == {
        "lane": "BOT_LANE", "tier": "OUTER_TURRET", "distance": 2540}
    assert out["beyond_own_outer_turret"] is True
    assert out["map_depth"] == -301


def test_ally_context_says_zero_when_the_support_is_with_me():
    support = _support_frames({7: (13200, 1800), 8: (13200, 1800)})
    out = S.ally_context(support, my_team=100, role="BOTTOM",
                         t_ms=8 * 60000 + 10000, my_pos=(13000, 1500),
                         my_zone="BOT", destroyed=set(), table=TABLE)
    assert out["support"]["away_from_my_zone_s"] == 0
    assert out["support"]["distance"] == 361


def test_ally_context_omits_the_support_block_when_unresolved():
    out = S.ally_context({}, my_team=100, role="BOTTOM", t_ms=8 * 60000,
                         my_pos=(13000, 1500), my_zone="BOT", destroyed=set(),
                         table=TABLE)
    assert "support" not in out
    assert "map_depth" in out


def test_ally_context_ignores_a_destroyed_turret():
    fallen = {(100, "BOT_LANE", "OUTER_TURRET")}
    out = S.ally_context({}, my_team=100, role="BOTTOM", t_ms=8 * 60000,
                         my_pos=(13000, 1500), my_zone="BOT", destroyed=fallen,
                         table=TABLE)
    assert out["nearest_friendly_turret"] == {
        "lane": "BOT_LANE", "tier": "INNER_TURRET", "distance": 6081}
    # Tombee, la tourelle exterieure ne definit plus de frontiere.
    assert "beyond_own_outer_turret" not in out


def test_ally_context_is_false_when_behind_my_own_outer_turret():
    out = S.ally_context({}, my_team=100, role="BOTTOM", t_ms=8 * 60000,
                         my_pos=(8000, 1200), my_zone="BOT", destroyed=set(),
                         table=TABLE)
    assert out["beyond_own_outer_turret"] is False


def test_signed_depth_is_public_and_signed():
    """Importer un `_depth` prive depuis un autre module contournerait la
    frontiere que le manifeste d'asymetrie rend explicite."""
    import positioning as P
    assert P.signed_depth(14000, 14000, 100) > 0
    assert P.signed_depth(14000, 14000, 200) < 0
    assert P.signed_depth is P._depth
