"""Manifestes de features par rôle. Le socle historique est ADC-centré : plusieurs
features n'ont aucun sens métier hors botlane et doivent être absentes des
manifestes des autres rôles."""
import pytest

import ml_features as mf
import positioning as pos
import riotlib as rl
import role_features as rf

BOTLANE_ONLY = {
    "kills_2v2", "assists_2v2", "deaths_early_2v2", "kda_2v2",
    "support_deaths_early",
}


def test_les_cinq_roles_ont_un_manifeste():
    assert set(rf.ROLE_FEATURES) == {"TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT"}
    assert rf.ROLES == ("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT")


def test_utility_est_seulement_un_alias_riot_du_support():
    assert rf.normalize_role("utility") == "SUPPORT"
    assert rf.normalize_role("support") == "SUPPORT"
    assert rf.riot_role("SUPPORT") == "UTILITY"
    assert rf.public_features("UTILITY") == rf.public_features("SUPPORT")


@pytest.mark.parametrize("role", ["TOP", "JUNGLE", "MIDDLE"])
def test_features_botlane_absentes_hors_botlane(role):
    assert BOTLANE_ONLY.isdisjoint(rf.ROLE_FEATURES[role])


def test_support_deaths_early_absent_du_support():
    """support_pid == my_pid pour un support : la valeur est structurellement 0."""
    assert "support_deaths_early" not in rf.ROLE_FEATURES["SUPPORT"]


def test_features_2v2_presentes_pour_les_deux_roles_botlane():
    expected = {"kills_2v2", "assists_2v2", "deaths_early_2v2", "kda_2v2"}
    for role in ("BOTTOM", "SUPPORT"):
        assert expected.issubset(rf.ROLE_FEATURES[role])


def test_combat_2v2_support_utilise_adc_et_support_allies():
    timeline = {"info": {"frames": [{"events": [
        {"type": "CHAMPION_KILL", "timestamp": 5 * 60_000,
         "killerId": 4, "assistingParticipantIds": [5], "victimId": 9},
    ]}]}}
    _, _, assists, _ = rl._combat_metrics(
        timeline, my_pid=5, support_pid=5, ally_bot_pids={4, 5},
        enemy_jungle_pid=7, enemy_bot_pids={9, 10},
        pid_role={4: "BOTTOM", 5: "UTILITY", 9: "BOTTOM"},
        pid_champ={4: "ADC", 5: "Support", 9: "EnemyADC"},
        my_fr={}, opp_fr={})
    assert assists[0]["is_2v2"] is True


def test_plates_absent_du_jungler():
    """Le jungler n'a pas de lane : plates_diff_early y est None."""
    assert "plates_diff_early" not in rf.ROLE_FEATURES["JUNGLE"]


def test_plates_present_pour_top_mid_bot():
    for role in ("TOP", "MIDDLE", "BOTTOM", "SUPPORT"):
        assert "plates_diff_early" in rf.ROLE_FEATURES[role]


def test_socle_commun_inclus_partout():
    for role in rf.ROLES:
        assert set(rf.COMMON_FEATURES).issubset(rf.ROLE_FEATURES[role])


def test_diffs_de_lane_descriptifs_reserves_au_mid():
    expected = {"gd10", "gd14", "csd10", "csd14", "xpd10"}
    assert set(rf.MIDDLE_DESCRIPTIVE) == expected
    assert expected.issubset(rf.ROLE_FEATURES["MIDDLE"])
    assert expected.issubset(rf.PUBLIC_DESCRIPTIVE)
    for role in set(rf.ROLES) - {"MIDDLE"}:
        assert expected.isdisjoint(rf.ROLE_FEATURES[role])


def test_features_specifiques_mid_ne_dupliquent_pas_le_socle_historique():
    assert set(rf.MIDDLE_DESCRIPTIVE).isdisjoint(mf.FEATURES)


def test_n_games_jamais_dans_un_manifeste():
    for role in rf.ROLES:
        assert "n_games" not in rf.ROLE_FEATURES[role]


def test_ml_only_est_cache_et_couvre_les_proxys_de_positioning():
    assert rf.HIDDEN_ML_ONLY == {f"pos_{name}" for name in pos.ML_ONLY}


def test_public_features_exclut_ml_only():
    for role in rf.ROLES:
        assert rf.HIDDEN_ML_ONLY.isdisjoint(rf.public_features(role))


def test_public_features_est_inclus_dans_le_manifeste_du_role():
    for role in rf.ROLES:
        assert set(rf.public_features(role)).issubset(rf.ROLE_FEATURES[role])


def test_trois_categories_disjointes():
    assert rf.PUBLIC_ACTIONABLE.isdisjoint(rf.PUBLIC_DESCRIPTIVE)
    assert rf.PUBLIC_ACTIONABLE.isdisjoint(rf.HIDDEN_ML_ONLY)
    assert rf.PUBLIC_DESCRIPTIVE.isdisjoint(rf.HIDDEN_ML_ONLY)


def test_toute_feature_du_socle_a_une_categorie():
    categorisees = rf.PUBLIC_ACTIONABLE | rf.PUBLIC_DESCRIPTIVE | rf.HIDDEN_ML_ONLY
    assert set(mf.FEATURES).issubset(categorisees)


def test_toute_feature_de_manifeste_a_une_categorie():
    categorisees = rf.PUBLIC_ACTIONABLE | rf.PUBLIC_DESCRIPTIVE | rf.HIDDEN_ML_ONLY
    for role in rf.ROLES:
        assert set(rf.ROLE_FEATURES[role]).issubset(categorisees)
