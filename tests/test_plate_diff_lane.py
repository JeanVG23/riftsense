"""Les plaques comptées doivent être celles de la lane du joueur, pas BOT_LANE
en dur : un top laner recevait jusqu'ici les plaques de sa botlane."""
import riotlib as rl


def _timeline(events):
    return {"info": {"frames": [{"events": events}]}}


def _plate(lane, team_id, minute):
    return {"type": "TURRET_PLATE_DESTROYED", "laneType": lane,
            "teamId": team_id, "timestamp": minute * 60000}


def test_plate_diff_compte_la_lane_demandee():
    tl = _timeline([_plate("TOP_LANE", 200, 5), _plate("BOT_LANE", 200, 6)])
    # my_team=100, enemy_team=200 : une plaque prise SUR l'ennemi compte pour moi
    assert rl._plate_diff_early(tl, 100, 200, "TOP_LANE") == 1


def test_plate_diff_ignore_les_autres_lanes():
    tl = _timeline([_plate("BOT_LANE", 200, 5), _plate("BOT_LANE", 200, 6)])
    assert rl._plate_diff_early(tl, 100, 200, "TOP_LANE") == 0


def test_plate_diff_none_pour_le_jungler():
    tl = _timeline([_plate("BOT_LANE", 200, 5)])
    assert rl._plate_diff_early(tl, 100, 200, None) is None


def test_plate_diff_retrocompatible_adc():
    """La valeur pour un ADC est inchangée : sa lane est BOT_LANE."""
    tl = _timeline([_plate("BOT_LANE", 200, 5), _plate("BOT_LANE", 100, 6)])
    assert rl._plate_diff_early(tl, 100, 200, "BOT_LANE") == 0


def test_plate_diff_compte_jusqu_a_juste_avant_14_minutes():
    tl = _timeline([{"type": "TURRET_PLATE_DESTROYED", "laneType": "TOP_LANE",
                     "teamId": 200, "timestamp": 14 * 60_000 - 1}])
    assert rl._plate_diff_early(tl, 100, 200, "TOP_LANE") == 1


def test_plate_diff_exige_une_lane_explicite():
    """Pas de lane par défaut : c'est exactement ainsi que le bug existait.

    Tant que la signature portait `lane="BOT_LANE"`, un appelant qui oubliait
    l'argument recevait les plaques de la botlane pour n'importe quel rôle,
    sans rien qui signale l'emprunt.
    """
    tl = _timeline([_plate("BOT_LANE", 200, 5)])
    try:
        rl._plate_diff_early(tl, 100, 200)
    except TypeError:
        return
    raise AssertionError("la lane doit être obligatoire")
