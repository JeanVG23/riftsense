"""Verifications d'ancrage : le detecteur doit mordre, pas seulement passer.

Un verificateur permissif produit 100 % d'ancrage et ne prouve rien. Le test
central ici est le CONTROLE NEGATIF : on falsifie des chiffres reels et on exige
un taux de detection minimal. C'est lui qui donne sa valeur au chiffre publie.
"""
from __future__ import annotations

import json

import grounding as G


def _payload(**over):
    base = {
        "meta": {"match_id": "EUW1_1", "champion": "Zeri", "duration_min": 31.0,
                 "kda": {"kills": 4, "deaths": 3, "assists": 6}},
        "journal": {
            "deaths": [
                {"t_ms": 282384, "clock": "4:42", "minute": 4, "phase": "early",
                 "zone": "BOT", "killer_champ": "Karma", "gold_state": "even",
                 "unspent_gold": 290, "level": 3,
                 "objective": {"type": "DRAGON", "status": "imminent", "delta_s": 18}},
                {"t_ms": 913000, "clock": "15:13", "minute": 15, "phase": "mid",
                 "zone": "JUNGLE/RIVER", "killer_champ": "Katarina",
                 "gold_state": "behind", "unspent_gold": 1225, "level": 11},
            ],
            "recalls": [{"t_ms": 202944, "clock": "3:22", "minute": 3,
                         "items_bought": 2, "gold_before": 562,
                         "items": [{"name": "Doran's Blade", "cost": 450}]}],
        },
        "benchmarks": {"outcome": "loss", "n_games_ref": 1026,
                       "death_zone_phase": {"BOT|early": 0.2906},
                       "death_gold_state": {"ahead": 0.2538}},
    }
    base.update(over)
    return base


def _record(evidence: str, cause: str = "gank bot sans vision") -> dict:
    return {"ts": "t1", "kind": "game", "match_id": "EUW1_1",
            "payload": _payload(),
            "review": {"strengths": [],
                       "mistakes": [{"point": "p", "cause": cause,
                                     "evidence": evidence}],
                       "next_focus": "f", "confidence": 0.6}}


# --- parsing ------------------------------------------------------------------

def test_cited_numbers_reads_units_and_ignores_clocks():
    cites = G.cited_numbers("mort à 15:13, 1 225 g non dépensés, 29 % des morts, "
                            "drake dans 18 s, 5 cs de retard")
    assert [c[1] for c in cites] == [1225.0, 29.0, 18.0, 5.0]      # 15:13 exclu
    assert [c[2] for c in cites] == ["g", "pct", "s", "cs"]


def test_unit_of_citation_reads_full_words():
    assert G.unit_of_citation(" secondes avant") == "s"
    assert G.unit_of_citation(" minutes") == "min"
    assert G.unit_of_citation("% des morts") == "pct"
    assert G.unit_of_citation(" morts") == "morts"        # denombrement cloisonne
    assert G.unit_of_citation(" recalls") == G.ANY        # denombrement generique


# --- ancrage des chiffres ------------------------------------------------------

def test_payload_number_is_grounded():
    check = G.check_review(_record("mort à 15:13 avec 1 225 g non dépensés"))
    assert [n["status"] for n in check["numbers"]] == ["exact"]


def test_invented_number_is_caught():
    check = G.check_review(_record("mort à 15:13 avec 1 840 g non dépensés"))
    assert [n["status"] for n in check["numbers"]] == ["non_ancre"]


def test_units_are_isolated():
    """Le coeur du detecteur : 290 existe dans le payload (gold non depense),
    mais le citer comme un POURCENTAGE reste une invention. Sans cloisonnement
    par unite, n'importe quel nombre du journal ancre n'importe quelle stat."""
    assert G.check_review(_record("290 g à 4:42"))["numbers"][0]["status"] == "exact"
    assert G.check_review(_record("290 % à 4:42"))["numbers"][0]["status"] == "non_ancre"


def test_damage_unit_is_isolated_from_gold_and_percentages():
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 900, "basic_share": 0.4,
    }
    record = _record("900 dégâts et 40 % d'autos à 4:42")
    record["payload"] = payload
    assert all(number["status"] != "non_ancre"
               for number in G.check_review(record)["numbers"])

    wrong_unit = _record("900 g à 4:42")
    wrong_unit["payload"] = payload
    assert G.check_review(wrong_unit)["numbers"][0]["status"] == "non_ancre"


def test_numbers_from_llm_causes_never_become_grounding_sources():
    payload = _payload(game_review_causes=[{
        "mistakes": [{"point": "ancien point", "cause": "9 999 g à 42:42"}],
    }])
    record = _record("9 999 g à 4:42")
    record["payload"] = payload
    assert G.check_review(record)["numbers"][0]["status"] == "non_ancre"


def test_bare_damage_and_gold_swing_values_are_grounded_without_unit_word():
    """Angle mort mesure sur 10 analyses fraiches : les valeurs de `damage` et de
    `team_gold_swing_90s` sont citees sans mot d'unite (« Baron 1043 », « swing
    -7737 »), donc classees ANY par `unit_of_citation` ; l'index doit quand meme
    les reconnaitre puisqu'elles existent reellement dans le payload."""
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 2389,
        "top_sources": [
            {"source": "SRU_Baron", "type": "MONSTER", "damage": 1043},
            {"source": "Ahri", "type": "OTHER", "damage": 591},
        ],
    }
    payload["journal"]["deaths"][0]["consequences"] = {
        "objectives_lost": [{"type": "BARON_NASHOR", "clock": "22:14", "delta_s": 16}],
        "team_gold_swing_90s": -7737,
    }
    record = _record("dégâts Baron 1043, Ahri 591, Baron perdu 16s après, "
                     "team_gold_swing_90s -7737, mort à 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert all(n["status"] != "non_ancre" for n in check["numbers"]), check["numbers"]


def test_negative_control_catches_bare_number_unit_collision():
    """Relecture, tour 1 : fusionner `dmg` et `g` dans le meme repli ANY
    recreait la collision inter-unites que le cloisonnement existe pour
    empecher. Cas demontre par le relecteur : un degat INVENTE (1230) tombe par
    coincidence a moins de 1 % d'un gold non depense REEL (1225, cf. `_payload`)
    ; sans mot-cle « degats »/« gold » a proximite dans le texte, il ne doit
    PAS s'ancrer sur ce gold sans rapport. Un taux d'ancrage qui ne mesure pas
    cette famille (nombres cites sans unite) ne vaut rien : c'est elle qui
    manquait au controle negatif existant (`FALSIFIED` ne falsifie que des
    citations a unite EXPLICITE)."""
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 2389,
        "top_sources": [{"source": "SRU_Baron", "type": "MONSTER", "damage": 1043}],
    }
    record = _record("elle m'inflige 1230, mort à 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert [n["status"] for n in check["numbers"]] == ["non_ancre"], check["numbers"]


def test_interjection_dommage_does_not_trigger_dmg_unit():
    """Relecture, tour 2 (constat A) : « dommage » est d'abord une interjection
    en francais courant (« Dommage, tu perds la lane... »), pas le concept de
    jeu. Il a ete retire des mots-cles pour ne pas faire declencher `dmg` sur
    la seule foi d'une exclamation : un nombre invente proche d'un vrai degat
    ne doit s'ancrer QUE si un vrai mot-clé de degats (« inflige », « degats »,
    « subis »...) est present dans la phrase."""
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 2389,
        "top_sources": [{"source": "SRU_Baron", "type": "MONSTER", "damage": 1228}],
    }
    record = _record("Dommage, tu payes 1230 à 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert [n["status"] for n in check["numbers"]] == ["non_ancre"], check["numbers"]


def test_unit_keyword_governance_resets_at_sentence_boundary():
    """« inflige »/« subis »/« gold_swing » sont polysemiques en theorie (un
    coach pourrait ecrire « tu subis un nerf ce patch » sans lien avec des
    degats), mais leur portee est BORNEE a la phrase courante : un point ou un
    point-virgule remet l'etat a zero, donc un mot-cle d'une phrase ne peut
    jamais faire ancrer un nombre sans rapport de la phrase suivante."""
    payload = _payload()
    payload["journal"]["deaths"][0]["consequences"] = {"team_gold_swing_90s": -500}
    record = _record("team_gold_swing_90s -500 après ta mort à 4:42. "
                     "Un total sans rapport de 777 apparaît plus loin.")
    record["payload"] = payload
    check = G.check_review(record)
    statuses = {n["raw"]: n["status"] for n in check["numbers"]}
    assert statuses["500 g"] != "non_ancre"          # le mot-cle de sa phrase s'applique
    assert statuses["777 any"] == "non_ancre"        # la phrase suivante n'en herite pas


def test_unit_keyword_governance_resets_at_comma():
    """Relecture, tour 3 : la portee de phrase (tour 2) ne se reinitialisait
    QUE sur point/point-virgule, pas sur la virgule. Cas demontre : dans une
    seule phrase a plusieurs clauses separees par des virgules, un mot-cle de
    degats en debut de phrase capturait des nombres de clauses SANS RAPPORT
    (une CS, un ecart d'XP) simplement parce qu'aucune virgule ne coupait
    l'etat. C'est la collision du tour 1 sous une autre forme."""
    cites = G.cited_numbers("Tu subis 1230 de degats sur ce trade, ta CS tombe a 45, "
                            "ton XP diff est de -320 a 14 minutes, et ton gold_state "
                            "est faible.")
    by_value = {value: unit for _, value, unit in cites}
    assert by_value[45.0] != "dmg", cites
    assert by_value[320.0] != "dmg", cites


def test_bare_digit_enumeration_survives_comma_reset():
    """La virgule remet l'etat a zero PAR DEFAUT (test precedent), sauf quand
    elle enchaine une simple continuation d'enumeration du payload, avec ou
    sans nom propre devant le chiffre (« 609 auto + 1 099 sorts », observe
    dans data/07_coaching/spadzze/reviews.jsonl) : ce n'est pas une clause a
    sujet different, juste la suite de la meme liste de degats."""
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 2389,
        "top_sources": [
            {"source": "LeeSin", "type": "OTHER", "damage": 609, "basic_damage": 609},
            {"source": "LeeSin", "type": "OTHER", "damage": 1099, "spell_damage": 1099},
        ],
    }
    record = _record("99,4 % des dégâts, 609 auto + 1 099 sorts, mort à 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert all(n["status"] != "non_ancre" for n in check["numbers"]), check["numbers"]


def test_negative_control_rate_on_bare_number_perturbation():
    """Constat B, tour 2 : le controle negatif precedent sur les citations SANS
    unite n'etait qu'un cas unique, pas une mesure de taux, contrairement a la
    famille a unite explicite (`test_negative_control_rate_on_systematic_
    perturbation`). Meme protocole applique aux citations de `damage`/
    `team_gold_swing_90s` citees brutes : x1,37 doit rester tres majoritairement
    detecte comme non ancre. Taux mesure lors de l'ecriture de ce test : 4/4
    (100 %) ; seuil fixe a 90 % pour laisser une marge sans jamais accepter un
    taux mediocre."""
    payload = _payload()
    payload["journal"]["deaths"][0]["damage"] = {
        "total_damage": 2389,
        "top_sources": [
            {"source": "SRU_Baron", "type": "MONSTER", "damage": 1043},
            {"source": "Ahri", "type": "OTHER", "damage": 591},
        ],
    }
    payload["journal"]["deaths"][0]["consequences"] = {"team_gold_swing_90s": -7737}
    record = _record("dégâts Baron 1043, Ahri 591, mort à 4:42, "
                     "team_gold_swing_90s -7737")
    record["payload"] = payload
    index = G.payload_index(payload)
    cites = [c for text in G._insight_texts(record["review"]) for c in G.cited_numbers(text)]
    assert len(cites) >= 3
    caught = sum(1 for _, value, unit in cites
                 if G.classify_number(value * 1.37, index, unit) == "non_ancre")
    assert caught / len(cites) >= 0.9


def test_consequences_clocks_beyond_deaths_and_recalls_are_grounded():
    """`payload_clocks` ne lisait que journal.deaths / journal.recalls : les
    horloges des blocs `consequences` (objectifs/batiments perdus) existent
    pourtant reellement dans le payload et etaient classees non_ancre."""
    payload = _payload()
    payload["journal"]["deaths"][0]["consequences"] = {
        "objectives_lost": [{"type": "BARON_NASHOR", "clock": "22:14", "delta_s": 16}],
        "buildings_lost": [{"type": "OUTER_TURRET", "lane": "BOT_LANE", "clock": "16:44"}],
    }
    record = _record("Baron perdu à 22:14, tourelle perdue à 16:44, mort à 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert [c["status"] for c in check["clocks"]] == ["exact", "exact", "exact"]


def test_window_constant_is_grounded_but_stays_bounded():
    """`team_gold_swing_90s` porte sa fenetre de 90 s dans le NOM de la cle,
    jamais comme valeur : la reconnaitre est une definition de feature (cf.
    `game_journal.GOLD_SWING_WINDOW_S`), pas une regle generique qui ancrerait
    n'importe quel nombre de nom de cle. Un autre nombre de fenetre invente
    (45 s) ne doit pas s'ancrer pour autant, et la constante des objectifs/
    batiments (`CONSEQUENCE_WINDOW_S` = 60 s) suit la meme logique."""
    payload = _payload()
    payload["journal"]["deaths"][0]["consequences"] = {
        "objectives_lost": [{"type": "BARON_NASHOR", "clock": "22:14", "delta_s": 16}],
        "team_gold_swing_90s": -7737,
    }
    record = _record("swing d'equipe sur 90 secondes, objectif pris dans les "
                     "60 secondes, mort a 4:42")
    record["payload"] = payload
    check = G.check_review(record)
    assert [n["status"] for n in check["numbers"]] == ["exact", "exact"]

    invented = _record("swing d'equipe sur 45 secondes apres ta mort a 4:42")
    invented["payload"] = payload
    assert G.check_review(invented)["numbers"][0]["status"] == "non_ancre"


def test_window_constant_is_not_grounded_when_block_is_absent():
    """Constat de relecture : les constantes de fenetre ne sont des definitions
    valides que si le bloc qu'elles definissent existe reellement dans CE
    payload. Un payload sans `consequences` ne doit pas laisser passer « 90
    secondes » par defaut."""
    check = G.check_review(_record("mort a 4:42, rien a 90 secondes"))
    assert [n["status"] for n in check["numbers"]] == ["non_ancre"]


def test_derived_share_may_be_cited_rounded():
    """« 50 % de tes morts (1/2) » est derivable du journal, pas invente."""
    check = G.check_review(_record("1 mort sur 2 en BOT à 4:42, soit 50 % de tes morts"))
    assert all(n["status"] != "non_ancre" for n in check["numbers"])


def test_percentage_benchmark_is_grounded_from_a_fraction():
    """Le payload stocke 0.2906 ; le coach ecrit « 29,1 % »."""
    check = G.check_review(_record("29,1 % des morts challenger en BOT early, à 4:42"))
    assert all(n["status"] != "non_ancre" for n in check["numbers"])


# --- ancrage des horodatages ---------------------------------------------------

def test_fabricated_clock_is_caught():
    """Le schema Pydantic verifie la PRESENCE d'un mm:ss, pas sa veracite :
    une evidence citant un moment inexistant passait la validation."""
    check = G.check_review(_record("mort à 22:07 avec 1 225 g non dépensés"))
    assert [c["status"] for c in check["clocks"]] == ["non_ancre"]


def test_real_clock_is_exact():
    check = G.check_review(_record("mort à 4:42, 290 g non dépensés"))
    assert [c["status"] for c in check["clocks"]] == ["exact"]


# --- asymetrie -----------------------------------------------------------------

def test_descriptive_feature_presented_as_a_fault_is_flagged():
    """Regle 3 du prompt : profondeur et over-extension sont des observations
    neutres (elles correlent au rang INFERIEUR). Les prescrire inverse le conseil."""
    review = {"strengths": [], "mistakes": [], "habits": [
        "Ta profondeur de carte moyenne est trop élevée, réduis-la"], "next_focus": "f"}
    assert len(G.asymmetry_violations(review)) == 1


def test_same_term_in_a_neutral_section_is_not_flagged():
    review = {"strengths": [{"point": "p", "cause": "c",
                             "evidence": "profondeur moyenne 254 u"}],
              "mistakes": [], "next_focus": "f"}
    assert G.asymmetry_violations(review) == []


# --- controle negatif (le test qui donne sa valeur au chiffre) -----------------

FALSIFIED = [
    "mort à 15:13 avec 1 679 g non dépensés",          # gold invente
    "38 % des morts challenger en BOT early, à 4:42",  # benchmark deforme
    "drake dans 47 s, mort à 4:42",                    # delta_s invente
    "12 cs de retard à 4:42",                          # cs invente
    "mort à 15:13, 4 morts en BOT",                    # denombrement invente
]


def test_negative_control_catches_falsified_numbers():
    """Chaque evidence ci-dessus deforme UNE valeur du payload. Un detecteur qui
    les laisse passer rendrait le taux d'ancrage publie sans signification."""
    missed = [text for text in FALSIFIED
              if all(n["status"] != "non_ancre"
                     for n in G.check_review(_record(text))["numbers"])]
    assert missed == [], f"falsifications non détectées : {missed}"


def test_negative_control_rate_on_systematic_perturbation():
    """Sur les chiffres d'une review reelle multiplies par 1,37, le detecteur
    doit en rejeter la large majorite (mesure de puissance, pas d'exactitude)."""
    record = _record("mort à 4:42 (290 g non dépensés, drake dans 18 s), puis à "
                     "15:13 (1 225 g non dépensés) ; 29,1 % des morts challenger "
                     "en BOT early, 25,4 % en étant ahead")
    index = G.payload_index(record["payload"])
    cites = [c for text in G._insight_texts(record["review"])
             for c in G.cited_numbers(text)]
    assert len(cites) >= 5
    caught = sum(1 for _, value, unit in cites
                 if G.classify_number(value * 1.37, index, unit) == "non_ancre")
    assert caught / len(cites) >= 0.8


# --- rapport -------------------------------------------------------------------

def test_report_aggregates_over_a_reviews_file(tmp_path):
    root = tmp_path / "07_coaching"
    (root / "p").mkdir(parents=True)
    (root / "p" / "reviews.jsonl").write_text(
        json.dumps(_record("mort à 4:42, 290 g non dépensés"), ensure_ascii=False)
        + "\n"
        + json.dumps(_record("mort à 22:07, 9 999 g non dépensés"), ensure_ascii=False)
        + "\n")
    rep = G.report("p", root=root)
    assert rep["n_reviews"] == 2
    assert rep["numbers"]["grounded_rate"] == 0.5
    assert rep["clocks"]["anchored_rate"] == 0.5
    assert len(rep["offenders"]) == 1
    assert "9 999 g" in rep["offenders"][0]["numbers"]


def _versioned(evidence: str, version: str | None) -> dict:
    rec = _record(evidence)
    rec["run"] = {} if version is None else {"prompt_version": version}
    return rec


def test_report_filters_on_prompt_version(tmp_path):
    root = tmp_path / "07_coaching"
    (root / "p").mkdir(parents=True)
    (root / "p" / "reviews.jsonl").write_text(
        json.dumps(_versioned("mort à 4:42, 290 g non dépensés", None),
                   ensure_ascii=False) + "\n"
        + json.dumps(_versioned("mort à 22:07, 9 999 g non dépensés", "abc123"),
                     ensure_ascii=False) + "\n")

    ancienne = G.report("p", root=root, prompt_version="none")
    assert ancienne["n_reviews"] == 1
    assert ancienne["numbers"]["grounded_rate"] == 1.0
    assert ancienne["prompt_version"] == "none"

    nouvelle = G.report("p", root=root, prompt_version="abc123")
    assert nouvelle["n_reviews"] == 1
    assert nouvelle["numbers"]["grounded_rate"] == 0.0

    assert G.report("p", root=root)["n_reviews"] == 2
