"""Features descriptives propres au role JUNGLE."""
import importlib.util
import math
from pathlib import Path

import pytest

import riotlib as rl
import role_features as rf

SPEC = importlib.util.spec_from_file_location(
    "build_dataset_jungle", Path("src/01_data_engineering/build_dataset.py"))
bd = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bd)


def _pf(jungle_cs):
    return {"jungleMinionsKilled": jungle_cs}


def test_jungle_metrics_separent_farm_impact_et_controle_equipe_early():
    timeline = {"info": {"frames": [{"events": [
        {"type": "CHAMPION_KILL", "timestamp": 5 * 60_000,
         "killerId": 3, "assistingParticipantIds": [2], "victimId": 8},
        {"type": "CHAMPION_KILL", "timestamp": 7 * 60_000,
         "killerId": 2, "assistingParticipantIds": [], "victimId": 7},
        {"type": "ELITE_MONSTER_KILL", "timestamp": 6 * 60_000,
         "monsterType": "DRAGON", "killerId": 2, "killerTeamId": 100},
        {"type": "ELITE_MONSTER_KILL", "timestamp": 9 * 60_000,
         "monsterType": "HORDE", "killerId": 8, "killerTeamId": 200},
    ]}]}}

    metrics = rl._jungle_metrics(
        timeline, my_pid=2, my_team=100,
        pid_team={1: 100, 2: 100, 3: 100, 7: 200, 8: 200},
        my_fr={10: _pf(64), 14: _pf(92)},
        opp_fr={10: _pf(58), 14: _pf(88)},
    )

    assert metrics == {
        "jungle_csm10": 6.4,
        "jungle_csm14": pytest.approx(92 / 14),
        "jungle_csd10": 6,
        "jungle_csd14": 4,
        "jungle_takedowns_early": 2,
        "jungle_kill_participation_early": 1.0,
        "jungle_team_epic_monsters_early": 1,
        "jungle_team_epic_monster_diff_early": 0,
    }


def test_jungle_metrics_excluent_exactement_la_minute_14_et_baron():
    timeline = {"info": {"frames": [{"events": [
        {"type": "CHAMPION_KILL", "timestamp": 14 * 60_000,
         "killerId": 2, "assistingParticipantIds": [], "victimId": 7},
        {"type": "ELITE_MONSTER_KILL", "timestamp": 13 * 60_000,
         "monsterType": "BARON_NASHOR", "killerId": 2, "killerTeamId": 100},
    ]}]}}
    metrics = rl._jungle_metrics(
        timeline, my_pid=2, my_team=100, pid_team={2: 100, 7: 200},
        my_fr={}, opp_fr={})
    assert metrics["jungle_takedowns_early"] == 0
    assert metrics["jungle_team_epic_monsters_early"] == 0
    assert metrics["jungle_kill_participation_early"] == 0.0


def test_objectif_utilise_killer_id_si_killer_team_id_manque():
    timeline = {"info": {"frames": [{"events": [{
        "type": "ELITE_MONSTER_KILL", "timestamp": 8 * 60_000,
        "monsterType": "RIFTHERALD", "killerId": 7,
    }]}]}}
    metrics = rl._jungle_metrics(
        timeline, my_pid=2, my_team=100, pid_team={2: 100, 7: 200},
        my_fr={}, opp_fr={})
    assert metrics["jungle_team_epic_monster_diff_early"] == -1


def test_game_to_row_aplatit_jungle_et_met_nan_pour_les_autres_roles():
    base = {
        "match_id": "m", "puuid": "p", "champion": "Vi", "win": True,
        "jungle": {"jungle_csm10": 6.1},
    }
    jungle_row = bd.game_to_row(base, None, "referentiel")
    assert jungle_row["jungle_csm10"] == 6.1
    assert math.isnan(jungle_row["jungle_csd10"])

    non_jungle_row = bd.game_to_row(
        base | {"jungle": {}}, None, "referentiel")
    assert all(math.isnan(non_jungle_row[name])
               for name in rf.JUNGLE_DESCRIPTIVE)


def test_features_jungle_sont_exclusives_et_descriptives():
    expected = set(rf.JUNGLE_DESCRIPTIVE)
    assert expected.issubset(rf.ROLE_FEATURES["JUNGLE"])
    assert expected.issubset(rf.PUBLIC_DESCRIPTIVE)
    assert expected.isdisjoint(rf.PUBLIC_ACTIONABLE)
    for role in set(rf.ROLES) - {"JUNGLE"}:
        assert expected.isdisjoint(rf.ROLE_FEATURES[role])
