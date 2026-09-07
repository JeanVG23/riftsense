import champion_profiles as cp


FAKE_DDRAGON = {
    "Caitlyn": {"attackrange": 650, "tags": ["Marksman"]},
    "Leona": {"attackrange": 125, "tags": ["Tank", "Support"]},
}
FAKE_TRAITS = {
    "Caitlyn": {"power_curve": "early", "lane_pattern": "poke"},
    "Leona": {"lane_pattern": "all_in"},
}


def test_vector_merges_ddragon_and_traits():
    v = cp.champion_vector("Caitlyn", traits=FAKE_TRAITS, ddragon=FAKE_DDRAGON)
    assert v["range_class"] == "ranged"
    assert v["tags"] == ["Marksman"]
    assert v["power_curve"] == "early"
    assert v["lane_pattern"] == "poke"


def test_vector_melee_range_class():
    v = cp.champion_vector("Leona", traits=FAKE_TRAITS, ddragon=FAKE_DDRAGON)
    assert v["range_class"] == "melee"
    assert v["lane_pattern"] == "all_in"


def test_vector_unknown_champion_degrades_cleanly():
    v = cp.champion_vector("Nobody", traits=FAKE_TRAITS, ddragon=FAKE_DDRAGON)
    assert v["range_class"] == "unknown"
    assert v["lane_pattern"] == "unknown"
    assert v["power_curve"] == "unknown"
    assert v["tags"] == []


def test_vector_resolves_case_insensitive_name():
    # API returns "FiddleSticks"; DDragon/traits key is "Fiddlesticks"
    dd = {"Fiddlesticks": {"attackrange": 480, "tags": ["Mage"]}}
    tr = {"Fiddlesticks": {"playstyle": "ganking", "gank_threat": "high"}}
    v = cp.champion_vector("FiddleSticks", traits=tr, ddragon=dd)
    assert v["range_class"] == "melee"        # 480 < 500
    assert v["gank_threat"] == "high"          # resolved despite casing


FAKE_ITEM_JSON = {"data": {
    "1038": {"name": "B.F. Sword", "gold": {"total": 1300}},
    "3031": {"name": "Infinity Edge", "gold": {"total": 3450}},
    "2055": {"name": "Control Ward", "gold": {"total": 75}},
}}


def test_parse_items_maps_id_to_name_and_cost():
    items = cp._parse_items(FAKE_ITEM_JSON["data"])
    assert items[1038] == {"name": "B.F. Sword", "cost": 1300, "finished": False}
    assert items[3031]["cost"] == 3450


def test_parse_items_flags_finished_items():
    """`finished` = pas de successeur, assez cher, pas un consommable.

    Le seuil ecarte les bottes de tier 2 (1100) et les composants sans
    successeur ; un composant comme Noonquiver a un `into` non vide et serait
    de toute facon ecarte.
    """
    raw = {
        "3094": {"name": "Rapid Firecannon", "gold": {"total": 2650},
                 "tags": ["CriticalStrike"]},
        "3006": {"name": "Berserker's Greaves", "gold": {"total": 1100},
                 "into": [], "tags": ["Boots"]},
        "6670": {"name": "Noonquiver", "gold": {"total": 1300},
                 "into": ["6671"], "tags": ["Damage"]},
        "2003": {"name": "Health Potion", "gold": {"total": 50},
                 "tags": ["Consumable"]},
        "9999": {"name": "Objet final historique", "gold": {"total": 2900},
                 "into": [""], "tags": []},
        "2420": {"name": "Seeker's Armguard", "gold": {"total": 1600},
                 "into": ["3157"], "tags": ["Armor"]},
    }
    items = cp._parse_items(raw)
    assert items[3094]["finished"] is True
    assert items[3006]["finished"] is False, "bottes de tier 2"
    assert items[6670]["finished"] is False, "composant a successeur"
    assert items[2003]["finished"] is False, "consommable"
    assert items[2420]["finished"] is False, "composant cher a successeur"
    # `into: [""]` : Data Dragon a marque des objets finaux d'un successeur vide.
    # Un simple `not into` les aurait classes composants.
    assert items[9999]["finished"] is True
    assert items[3094]["name"] == "Rapid Firecannon"
    assert items[3094]["cost"] == 2650


def test_parse_items_tolerates_a_missing_cost():
    items = cp._parse_items({"1": {"name": "Sans prix"}})
    assert items[1]["cost"] is None
    assert items[1]["finished"] is False


def test_trim_items_keeps_what_parse_items_reads():
    """Sans `into`/`tags`, la demo classerait fini tout objet >= 1600 :
    une divergence prod/demo invisible au test de parite."""
    import build_demo_fixtures as bdf
    trimmed = bdf.trim_items({"data": {
        "6670": {"name": "Noonquiver", "gold": {"total": 1300, "base": 300},
                 "into": ["6671"], "tags": ["Damage"], "description": "verbeux"},
    }})
    entry = trimmed["data"]["6670"]
    assert entry == {"name": "Noonquiver", "gold": {"total": 1300},
                     "into": ["6671"], "tags": ["Damage"]}
    assert cp._parse_items(trimmed["data"])[6670]["finished"] is False


def test_load_items_missing_file_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(cp, "STATIC_DIR", tmp_path)
    cp.load_items.cache_clear()
    assert cp.load_items() == {}
    cp.load_items.cache_clear()


def test_load_items_reads_cached_file(tmp_path, monkeypatch):
    import json
    dest = tmp_path / "ddragon" / cp.DDRAGON_VERSION
    dest.mkdir(parents=True)
    (dest / "item.json").write_text(json.dumps(FAKE_ITEM_JSON))
    monkeypatch.setattr(cp, "STATIC_DIR", tmp_path)
    cp.load_items.cache_clear()
    assert cp.load_items()[2055] == {"name": "Control Ward", "cost": 75, "finished": False}
    cp.load_items.cache_clear()
