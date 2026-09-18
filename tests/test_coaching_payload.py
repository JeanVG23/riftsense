import json

import pytest

import positioning as P
import payload as PL


def test_pos_meta_keys_match_coaching_safe():
    assert set(PL.POS_META) == P.COACHING_SAFE


def test_pos_signals_depth_always_descriptive_never_notable():
    mf = {"positioning": {"max_map_depth": 2728.0, "frac_roam_mid": 0.50}}
    rf = {"positioning": {"max_map_depth": 1633.0, "frac_roam_mid": 0.70}}
    out = {s["key"]: s for s in PL._pos_signals(mf, rf)}
    assert out["max_map_depth"]["descriptive_only"] is True
    assert out["max_map_depth"]["notable"] is False          # malgré delta énorme
    assert out["frac_roam_mid"]["notable"] is True            # |−0.20| ≥ 0.08
    assert "descriptive_only" not in out["frac_roam_mid"]


def test_pos_signals_only_coaching_safe_keys():
    mf = {"positioning": {k: 0.5 for k in P.ALL_FEATURES}}     # inclut ML_ONLY
    rf = {"positioning": {k: 0.5 for k in P.ALL_FEATURES}}
    keys = {s["key"] for s in PL._pos_signals(mf, rf)}
    assert keys <= P.COACHING_SAFE
    assert keys.isdisjoint(P.ML_ONLY)


def test_lane_signals_thresholds():
    mf = {"lane": {"gd10": 100, "csd14": 0}}
    rf = {"lane": {"gd10": -100, "csd14": -5}}
    out = {s["key"]: s for s in PL._lane_signals(mf, rf)}
    assert out["gd10"]["delta"] == 200 and out["gd10"]["notable"] is True   # >150
    assert out["csd14"]["delta"] == 5 and out["csd14"]["notable"] is True   # ≥2 cs


def test_zone_phase_signals_top_overdeaths():
    mf = {"by_zone_phase": {"BOT|mid": 0.29, "MID|late": 0.10}}
    rf = {"by_zone_phase": {"BOT|mid": 0.05, "MID|late": 0.11}}
    out = PL._zone_phase_signals(mf, rf)
    assert out[0]["key"] == "BOT|mid" and out[0]["notable"] is True         # Δ +0.24


def test_build_reads_gold_and_flags_low_sample(tmp_path):
    facet = {"n_games": 3, "deaths_per_game": 6.0,
             "lane": {"gd10": -100, "gd14": 0, "gd20": 0, "csd10": 0, "csd14": -5},
             "positioning": {k: 0.5 for k in P.COACHING_SAFE},
             "death_gold_state": {"ahead": 0.3, "even": 0.2, "behind": 0.5},
             "by_zone_phase": {"BOT|mid": 0.3}}
    agg = {"scope": "adc", "patch": "16.13", "n_games": 3, "winrate": 0.33,
           "overall": facet, "win": facet, "loss": facet, "by_lane_context": {}}
    for who, n in (("personal/spadzze", 3), ("referentiel/challenger", 1000)):
        a = dict(agg); a["n_games"] = n
        d = tmp_path / who / "adc"; d.mkdir(parents=True)
        (d / "aggregate.json").write_text(json.dumps(a))
    pl = PL.build("spadzze", "adc", "challenger", "loss", gold_dir=tmp_path)
    assert pl["meta"]["low_sample"] is True                  # 3 < 30
    assert pl["meta"]["n_games_ref"] == 1000
    # aucune feature ML_ONLY nulle part dans le payload sérialisé
    blob = json.dumps(pl)
    assert all(k not in blob for k in P.ML_ONLY)
    assert any(s["group"] == "positioning" for s in pl["signals"])


def test_build_raises_file_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        PL.build("ghost", "adc", "challenger", "loss", gold_dir=tmp_path)


def test_zone_phase_ordering_is_deterministic_on_ties():
    """Régression 2026-09-04, trouvée par la parité Python/TypeScript.

    `_zone_phase_signals` itérait `set(me) | set(ref)` : à delta égal, l'ordre
    dépendait du hachage des chaînes, donc du PYTHONHASHSEED. Deux exécutions
    pouvaient donner deux payloads différents pour la même game, et le TypeScript
    (qui part de clés triées) divergeait. Seul un ex aequo rendait le défaut visible.
    """
    mf = {"by_zone_phase": {"MID|late": 0.2, "JUNGLE/RIVER|late": 0.1,
                            "JUNGLE/RIVER|early": 0.1, "BOT|early": 0.1}}
    rf = {"by_zone_phase": {}}
    keys = [s["key"] for s in PL._zone_phase_signals(mf, rf)]
    assert keys == ["MID|late", "BOT|early", "JUNGLE/RIVER|early", "JUNGLE/RIVER|late"]


def test_game_review_map_keeps_causes_but_drops_llm_evidence_and_ids():
    reviews = [
        {"ts": "2026-09-02", "kind": "game", "scope": "adc",
         "match_id": "EUW1_42", "payload": {"meta": {"champion": "Jinx", "win": False}},
         "review": {"strengths": [], "mistakes": [{
             "point": "Tu greed tes resets", "cause": "Tu attends trop longtemps",
             "evidence": "1 268 g à 11:06",
         }]}},
        {"ts": "2026-09-03", "kind": "game", "scope": "mid",
         "payload": {"meta": {"champion": "Ahri", "win": True}},
         "review": {"mistakes": [{"point": "mid", "cause": "mid cause"}]}},
    ]
    causes = PL._game_review_sample(reviews, "adc")["causes"]
    assert causes == [{
        "champion": "Jinx", "outcome": "loss", "strengths": [],
        "mistakes": [{"point": "Tu greed tes resets",
                      "cause": "Tu attends trop longtemps"}],
    }]
    assert "1 268" not in json.dumps(causes) and "EUW1_42" not in json.dumps(causes)


def _review(ts: str, win: bool, champion: str = "Zeri", role: str = "BOTTOM") -> dict:
    return {"ts": ts, "kind": "game", "scope": "adc", "match_id": f"m-{ts}",
            "payload": {"meta": {"champion": champion, "role": role, "win": win}},
            "review": {"strengths": [], "mistakes": [
                {"point": f"point-{ts}", "cause": f"cause-{ts}", "evidence": "12:30"}
            ]}}


def test_game_review_sample_modes_counts_and_cap():
    empty = PL._game_review_sample([], "adc")
    assert empty == {"mode": "none",
                     "available": {"total": 0, "wins": 0, "losses": 0},
                     "used": {"total": 0, "wins": 0, "losses": 0}, "causes": []}

    only_losses = PL._game_review_sample([_review(str(i), False) for i in range(3)], "adc")
    assert only_losses["mode"] == "unbalanced"
    assert only_losses["available"] == {"total": 3, "wins": 0, "losses": 3}
    assert only_losses["used"] == {"total": 1, "wins": 0, "losses": 1}

    mixed = PL._game_review_sample(
        [_review(f"w{i}", True) for i in range(4)]
        + [_review(f"l{i}", False) for i in range(5)], "adc")
    assert mixed["mode"] == "balanced"
    assert mixed["available"] == {"total": 9, "wins": 4, "losses": 5}
    assert mixed["used"] == {"total": 4, "wins": 2, "losses": 2}


def test_game_review_sample_matches_role_scopes_only():
    reviews = [_review("1", False, "Zeri"), _review("2", True, "Jinx")]
    assert PL._game_review_sample(reviews, "adc")["available"]["total"] == 2
    assert PL._game_review_sample(reviews, "ZeRi")["available"]["total"] == 0


def test_build_rejects_champion_scope(tmp_path):
    with pytest.raises(ValueError, match="scope de benchmark inconnu"):
        PL.build("spadzze", scope="zeri", gold_dir=tmp_path)


def test_game_review_sample_counts_latest_run_once_per_match():
    old = _review("2026-09-01", False)
    new = _review("2026-09-02", False)
    old["match_id"] = new["match_id"] = "EUW1_42"
    sample = PL._game_review_sample([old, new], "adc")
    assert sample["available"] == {"total": 1, "wins": 0, "losses": 1}
    assert sample["causes"][0]["mistakes"][0]["point"] == "point-2026-09-02"
