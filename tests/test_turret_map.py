"""Table des tourelles : reconstitution depuis le raw, puis lecture.

Le script one-shot doit ÉCHOUER plutôt que d'écrire une table douteuse : une
position multiple signale un remaniement de carte, un effectif incomplet
biaiserait `nearest_standing` (une tourelle jamais observée passerait pour
debout en permanence).
"""
import json

import pytest

import build_turret_map as B
import turrets as T


def _building(t_ms, team, lane, tower, x, y):
    return {"type": "BUILDING_KILL", "timestamp": t_ms, "teamId": team,
            "laneType": lane, "towerType": tower, "position": {"x": x, "y": y}}


def _inhibitor(t_ms, team, lane, x, y):
    """`BUILDING_KILL` sans `towerType` : un inhibiteur, hors table."""
    return {"type": "BUILDING_KILL", "timestamp": t_ms, "teamId": team,
            "laneType": lane, "buildingType": "INHIBITOR_BUILDING",
            "position": {"x": x, "y": y}}


def _timeline(events):
    return {"info": {"frames": [{"timestamp": 0, "participantFrames": {},
                                 "events": list(events)}]}}


LANES = ("TOP_LANE", "MID_LANE", "BOT_LANE")
TIERS = ("OUTER_TURRET", "INNER_TURRET", "BASE_TURRET")


def _complete_events():
    """Les 20 clés et 22 positions attendues sur la Faille."""
    events, t = [], 0
    for team in (100, 200):
        for lane in LANES:
            for tier in TIERS:
                t += 1000
                events.append(_building(t, team, lane, tier,
                                        team + len(lane), t))
        # Deux tourelles de nexus par equipe, meme cle, deux positions.
        for offset in (0, 1):
            t += 1000
            events.append(_building(t, team, "MID_LANE", "NEXUS_TURRET",
                                    team + offset, t))
    return events


def test_scan_ignores_inhibitors():
    """Sans le filtre `towerType`, le compte reel est 26 cles / 28 positions."""
    events = _complete_events() + [_inhibitor(99000, 100, "BOT_LANE", 1, 2)]
    table = B.scan(lambda name: _timeline(events), ["m_timeline"])
    assert len(table) == B.EXPECTED_KEYS
    assert sum(len(v) for v in table.values()) == B.EXPECTED_POSITIONS
    assert all(key[2] != "INHIBITOR_BUILDING" for key in table)


def test_build_rejects_a_second_position_for_a_simple_turret():
    events = _complete_events() + [
        _building(99000, 100, "BOT_LANE", "OUTER_TURRET", 999, 999)]
    with pytest.raises(SystemExit):
        B.validate(B.scan(lambda name: _timeline(events), ["m_timeline"]))


def test_build_rejects_an_incomplete_sample():
    """Une cle manquante ferait passer une tourelle jamais observee pour debout."""
    events = [e for e in _complete_events()
              if not (e.get("towerType") == "BASE_TURRET" and e["teamId"] == 200)]
    with pytest.raises(SystemExit):
        B.validate(B.scan(lambda name: _timeline(events), ["m_timeline"]))


def test_build_accepts_the_complete_table(tmp_path):
    rows = B.rows(B.validate(B.scan(lambda name: _timeline(_complete_events()),
                                    ["m_timeline"])))
    assert len(rows) == B.EXPECTED_POSITIONS
    out = tmp_path / "sr_turrets.json"
    out.write_text(json.dumps(rows), encoding="utf-8")
    assert len(T.load(static_dir=tmp_path)) == B.EXPECTED_POSITIONS


def test_nearest_standing_ignores_a_destroyed_turret(tmp_path):
    """Une tourelle detruite ne protege plus personne : le dire serait faux."""
    rows = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
             "x": 10000, "y": 1000},
            {"team": 100, "lane": "BOT_LANE", "tier": "INNER_TURRET",
             "x": 7000, "y": 1500},
            {"team": 200, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
             "x": 13000, "y": 4500}]
    (tmp_path / "sr_turrets.json").write_text(json.dumps(rows), encoding="utf-8")
    table = T.load(static_dir=tmp_path)

    near = T.nearest_standing(10100, 1000, 100, set(), table=table)
    assert near == {"lane": "BOT_LANE", "tier": "OUTER_TURRET", "distance": 100}

    fallen = {(100, "BOT_LANE", "OUTER_TURRET")}
    assert T.nearest_standing(10100, 1000, 100, fallen,
                              table=table)["tier"] == "INNER_TURRET"
    # Jamais une tourelle ennemie : « ta tourelle » est un abri, pas la tour
    # d'en face. Colle a la tourelle exterieure ennemie, le plus proche abri
    # de l'equipe 100 reste sa propre tourelle interieure.
    assert T.nearest_standing(13000, 4500, 100, fallen, table=table) == {
        "lane": "BOT_LANE", "tier": "INNER_TURRET", "distance": 6708}
    # Toutes mes tourelles tombees : rien a citer, plutot qu'un repere faux.
    everything = {(100, "BOT_LANE", "OUTER_TURRET"),
                  (100, "BOT_LANE", "INNER_TURRET")}
    assert T.nearest_standing(10100, 1000, 100, everything, table=table) is None


def test_own_outer_is_none_once_it_has_fallen(tmp_path):
    """Tombee, la tourelle exterieure ne definit plus de frontiere : l'appelant
    omet `beyond_own_outer_turret` au lieu de trancher sur un repere disparu."""
    rows = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
             "x": 10000, "y": 1000}]
    (tmp_path / "sr_turrets.json").write_text(json.dumps(rows), encoding="utf-8")
    table = T.load(static_dir=tmp_path)
    assert T.own_outer(100, "BOTTOM", set(), table=table)["x"] == 10000
    assert T.own_outer(100, "BOTTOM", {(100, "BOT_LANE", "OUTER_TURRET")},
                       table=table) is None
    assert T.own_outer(100, "JUNGLE", set(), table=table) is None


def test_destroyed_at_reads_the_losing_team():
    """Semantique timeline : `BUILDING_KILL.teamId` = equipe qui PERD."""
    events = [_building(600000, 100, "BOT_LANE", "OUTER_TURRET", 1, 1),
              _building(900000, 200, "TOP_LANE", "OUTER_TURRET", 2, 2)]
    assert T.destroyed_at(events, 700000) == {(100, "BOT_LANE", "OUTER_TURRET")}
    assert T.destroyed_at(events, 950000) == {
        (100, "BOT_LANE", "OUTER_TURRET"), (200, "TOP_LANE", "OUTER_TURRET")}
    assert T.destroyed_at(events, 100000) == set()


def test_lane_of_role_covers_the_five_positions():
    assert T.LANE_OF_ROLE["BOTTOM"] == "BOT_LANE"
    assert T.LANE_OF_ROLE["UTILITY"] == "BOT_LANE"
    assert T.LANE_OF_ROLE["MIDDLE"] == "MID_LANE"
    assert T.LANE_OF_ROLE["TOP"] == "TOP_LANE"
    assert T.LANE_OF_ROLE["JUNGLE"] is None
