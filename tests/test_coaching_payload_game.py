import json

import pytest

import positioning as P
import payload as PL
import test_game_journal as TJ


def _dirs(tmp_path):
    """Silver perso (1 game ADC + 1 game jungle) + gold référentiel challenger/adc."""
    silver, gold = tmp_path / "silver", tmp_path / "gold"
    p = silver / "personal" / "spadzze"
    p.mkdir(parents=True)
    recs = [  # la game ADC n'est PAS la dernière ligne -> prouve le filtre de scope
        {"match_id": "EUW1_42", "puuid": TJ.ME, "role": "BOTTOM",
         "champion": "Zeri", "win": True, "queue": 420,
         "comp": {"self_adc": "Zeri", "self_support": "Lulu",
                  "enemy_adc": "Jinx", "enemy_support": "Thresh",
                  "self_jungle": "Vi", "enemy_jungle": "LeeSin",
                  "enemy_mid": "Orianna"}},
        {"match_id": "EUW1_43", "puuid": TJ.ME, "role": "JUNGLE",
         "champion": "Diana", "win": False, "queue": 420},
    ]
    (p / "games.jsonl").write_text("\n".join(json.dumps(r) for r in recs) + "\n")
    facet = {"n_games": 400, "deaths_per_game": 4.2,
             "by_zone_phase": {"BOT|mid": 0.05},
             "death_gold_state": {"ahead": 0.2, "even": 0.3, "behind": 0.5}}
    d = gold / "referentiel" / "challenger" / "adc"
    d.mkdir(parents=True)
    (d / "aggregate.json").write_text(json.dumps(
        {"n_games": 1000, "winrate": 0.5,
         "overall": facet, "win": facet, "loss": facet}))
    return silver, gold


def _load_raw(base):
    if base.endswith("_match"):
        return TJ._match(win=True)
    return TJ._basic_timeline({4: [TJ._kill(270000, victim=1, killer=6)],
                               5: [TJ._buy(310000, 1)]})


def test_build_game_selects_latest_game_of_scope(tmp_path):
    silver, gold = _dirs(tmp_path)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    assert pl["meta"]["match_id"] == "EUW1_42"       # la Diana jungle est ignorée
    assert pl["meta"]["kind"] == "game"
    assert pl["meta"]["champion"] == "Zeri" and pl["meta"]["opponent"] == "Jinx"
    assert len(pl["journal"]["deaths"]) == 1
    assert pl["journal"]["deaths"][0]["clock"] == "4:30"
    assert len(pl["journal"]["recalls"]) == 1


def test_build_game_benchmarks_at_same_outcome(tmp_path):
    silver, gold = _dirs(tmp_path)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    b = pl["benchmarks"]
    assert b["outcome"] == "win"                     # game gagnée -> facette win
    assert b["deaths_per_game"] == 4.2
    assert b["death_gold_state"]["behind"] == 0.5
    assert b["n_games_ref"] == 1000


def test_build_game_by_match_id_and_not_found(tmp_path):
    silver, gold = _dirs(tmp_path)
    pl = PL.build_game("spadzze", match_id="EUW1_42", scope="adc",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    assert pl["meta"]["match_id"] == "EUW1_42"
    with pytest.raises(FileNotFoundError):
        PL.build_game("spadzze", match_id="EUW1_999", scope="adc",
                      gold_dir=gold, silver_dir=silver, load_raw=_load_raw)


def test_build_game_rejects_champion_scope(tmp_path):
    silver, gold = _dirs(tmp_path)
    with pytest.raises(ValueError, match="scope de benchmark inconnu"):
        PL.build_game("spadzze", scope="zeri", gold_dir=gold,
                      silver_dir=silver, load_raw=_load_raw)


def test_build_game_never_leaks_ml_only(tmp_path):
    silver, gold = _dirs(tmp_path)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    blob = json.dumps(pl)
    assert all(k not in blob for k in P.ML_ONLY)


# --- filter_scope (partagé _select_game / sélection batch) --------------------

def test_filter_scope_by_role_and_all_only():
    records = [
        {"match_id": "m1", "role": "BOTTOM", "champion": "Zeri"},
        {"match_id": "m2", "role": "MIDDLE", "champion": "Ahri"},
        {"match_id": "m3", "role": "BOTTOM", "champion": "Jinx"},
    ]
    assert [r["match_id"] for r in PL.filter_scope(records, "adc")] == ["m1", "m3"]
    assert [r["match_id"] for r in PL.filter_scope(records, "all")] == ["m1", "m2", "m3"]
    with pytest.raises(ValueError, match="scope de benchmark inconnu"):
        PL.filter_scope(records, "zeri")


# --- Items résolus et contexte de matchup ----------------------------------------

# `finished` ajoute a la constante existante : c'est ce que `load_items` rend
# desormais, et le journal en a besoin pour la notion de spike.
FAKE_CATALOG = {1055: {"name": "Doran's Blade", "cost": 450, "finished": False},
                3094: {"name": "Rapid Firecannon", "cost": 2650, "finished": True}}


def test_build_game_resolves_recall_items(tmp_path, monkeypatch):
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: FAKE_CATALOG)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    (r1,) = pl["journal"]["recalls"]
    assert r1["items"] == [{"name": "Doran's Blade", "cost": 450, "finished": False}]
    assert "item_ids" not in r1                      # ids bruts non exposés au LLM


def test_build_game_degrades_without_item_catalog(tmp_path, monkeypatch):
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: {})
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    (r1,) = pl["journal"]["recalls"]
    assert "items" not in r1 and "item_ids" not in r1


def test_build_game_exposes_matchup_context(tmp_path, monkeypatch):
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: {})
    monkeypatch.setattr(PL.cprof, "derive_context",
                        lambda comp: {"lane_pattern": "all_in",
                                      "gank_exposure": "high"})
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    ctx = pl["context"]
    assert ctx["comp"]["enemy_support"] == "Thresh"
    assert ctx["lane_pattern"] == "all_in" and ctx["gank_exposure"] == "high"


def test_build_game_exposes_lane_matchup_spells_runes_and_final_build(tmp_path, monkeypatch):
    silver, gold = _dirs(tmp_path)
    match = TJ._match()
    me, opponent = match["info"]["participants"][0], match["info"]["participants"][5]
    me.update({"summoner1Id": 4, "summoner2Id": 7, "item0": 1055,
               "perks": {"styles": [{"selections": [{"perk": 8005}]},
                                      {"selections": [{"perk": 9101}]}]}})
    opponent.update({"summoner1Id": 4, "summoner2Id": 21, "item0": 1055,
                     "perks": {"styles": [{"selections": [{"perk": 8021}]},
                                            {"selections": []}]}})

    def load(base):
        return match if base.endswith("_match") else TJ._basic_timeline()

    monkeypatch.setattr(PL.cprof, "load_items", lambda: FAKE_CATALOG)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=load)
    matchup = pl["context"]["matchup"]
    assert matchup["lane_opponent"] == "Jinx"
    assert [spell["name"] for spell in matchup["player"]["summoner_spells"]] == [
        "Flash", "Heal"]
    assert matchup["player"]["keystone"]["name"] == "Press the Attack"
    assert matchup["player"]["secondary_runes"] == [{"id": 9101, "name": "Absorb Life"}]
    assert matchup["opponent"]["final_build"] == [FAKE_CATALOG[1055]]


def test_death_links_gold_to_actual_next_purchase(tmp_path, monkeypatch):
    """Régression feedback : 1 268 g avant BF 1 300 g n'est pas un mauvais reset."""
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: {
        1038: {"name": "B. F. Sword", "cost": 1300},
    })

    def load(base):
        if base.endswith("_match"):
            return TJ._match()
        return TJ._basic_timeline({
            11: [TJ._kill(666000, victim=1, killer=6),
                 TJ._buy(677000, 1, item=1038)],
        })

    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=load)
    death = pl["journal"]["deaths"][0]
    assert death["unspent_gold"] == 1234
    assert death["next_purchase"] == {
        "clock": "11:17",
        "items": [{"name": "B. F. Sword", "cost": 1300}],
        "cheapest_item_cost": 1300,
    }


def test_build_game_keeps_raw_matchup_without_silver_comp(tmp_path, monkeypatch):
    # Le matchup vient du match brut même si l'ancien silver n'a pas de comp.
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: {})
    pl = PL.build_game("spadzze", match_id="EUW1_43", scope="adc",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    assert "comp" not in pl["context"]
    assert pl["context"]["matchup"]["lane_opponent"] == "Jinx"


def test_build_game_bundle_is_bounded_hashed_and_records_unavailable(tmp_path, monkeypatch):
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: {})
    records = PL._personal_records("spadzze", silver)
    records[0]["game_ts"] = 2
    records[1]["game_ts"] = 1

    def load(base):
        if base.startswith("EUW1_43"):
            return None
        return _load_raw(base)

    bundle = PL.build_game_bundle(
        "spadzze", records=records, target="challenger", max_games=2,
        gold_dir=gold, silver_dir=silver, load_raw=load, item_catalog={},
        now=lambda: "2026-09-06T10:00:00Z",
    )
    assert bundle["generated_at"] == "2026-09-06T10:00:00Z"
    entry = bundle["items"]["EUW1_42"]
    assert entry["benchmark_scope"] == "adc"
    assert len(entry["payload_hash"]) == 12
    assert "puuid" not in json.dumps(entry)
    assert bundle["unavailable"] == [
        {"match_id": "EUW1_43", "reason": "benchmark_missing"}
    ]


def test_build_game_injects_the_item_catalog_into_the_journal(tmp_path, monkeypatch):
    """`build_game` resolvait le catalogue APRES le journal, donc le journal
    n'avait pas la notion d'objet fini et les blocs de spike manquaient."""
    silver, gold = _dirs(tmp_path)
    seen = {}
    real = PL.gj.game_journal

    def spy(match, timeline, puuid, items=None):
        seen["items"] = items
        return real(match, timeline, puuid, items=items)

    monkeypatch.setattr(PL.cprof, "load_items", lambda: FAKE_CATALOG)
    monkeypatch.setattr(PL.gj, "game_journal", spy)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    assert seen["items"] is FAKE_CATALOG
    (recall,) = pl["journal"]["recalls"]
    assert "item_ids" not in recall              # ids bruts non exposes au LLM
    assert recall["outcome"] == {"gold_spent": 450, "finished_items": [],
                                 "is_spike": False}


def test_build_game_carries_the_new_journal_blocks(tmp_path, monkeypatch):
    """Les blocs neufs remontent bien au payload servi au modele."""
    silver, gold = _dirs(tmp_path)
    monkeypatch.setattr(PL.cprof, "load_items", lambda: FAKE_CATALOG)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    (recall,) = pl["journal"]["recalls"]
    # La timeline de fixture n'a pas de champ de CS : la fenetre est mesurable,
    # la ligne de base vaut 0, et le bloc dit honnetement 0 plutot que rien.
    assert recall["cs_cost"]["window"] == {"from": "5:00", "to": "7:00"}
    (death,) = pl["journal"]["deaths"]
    assert isinstance(death["ally_context"]["map_depth"], int)
    # Le jungler ennemi est resolu (LeeSin) mais n'a laisse aucun indice
    # public : le bloc existe, `last` est nul, et l'age compte depuis 0:00.
    assert death["jungle_signals"] == {"champion": "LeeSin", "age_s": 270,
                                       "last": None}


def test_game_benchmark_falls_back_from_missing_role_to_all(tmp_path):
    _, gold = _dirs(tmp_path)
    source = gold / "referentiel" / "challenger" / "adc" / "aggregate.json"
    target = gold / "referentiel" / "challenger" / "all" / "aggregate.json"
    target.parent.mkdir(parents=True)
    target.write_text(source.read_text())

    scope, ref = PL._game_benchmark_scope(
        {"champion": "Diana", "role": "JUNGLE"}, "challenger", gold, {},
    )
    assert scope == "all"
    assert ref["n_games"] == 1000


def test_game_benchmark_ignores_legacy_champion_aggregate(tmp_path):
    _, gold = _dirs(tmp_path)
    champion = gold / "referentiel" / "challenger" / "zeri" / "aggregate.json"
    champion.parent.mkdir(parents=True)
    champion.write_text(json.dumps({"n_games": 9999}))

    scope, ref = PL._game_benchmark_scope(
        {"champion": "Zeri", "role": "BOTTOM"}, "challenger", gold, {},
    )
    assert scope == "adc"
    assert ref["n_games"] == 1000
