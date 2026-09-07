#!/usr/bin/env python3
"""04_coaching — vérifications d'ancrage des reviews persistées (0 réseau, 0 LLM).

Le prompt pose trois règles dures que rien ne vérifiait :

1. « n'invente aucune stat absente du payload » (règle 2) — aucun contrôle.
2. l'horodatage `mm:ss` : le schéma `AnchoredInsight` vérifie sa PRÉSENCE, pas sa
   VÉRACITÉ. Une evidence citant 17:05 alors que la mort est à 14:22 passe la
   validation Pydantic.
3. asymétrie : les features `descriptive_only` (profondeur, over-extension) sont
   des observations neutres, jamais des fautes.

Ces trois règles sont mécaniquement vérifiables sur les reviews DÉJÀ persistées :
elles donnent un score d'hallucination sans annoter quoi que ce soit, et elles
tournent en CI. Elles ne remplacent pas l'annotation humaine (qui juge l'UTILITÉ) :
elles mesurent la FIDÉLITÉ au payload, qui en est le préalable.

Usage :
  python3 src/04_coaching/grounding.py --player spadzze [--json] [--details]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))  # accès src/core/

import feedback as feedback_mod
import game_journal

# --- extraction des nombres cités --------------------------------------------

_CLOCK_RE = re.compile(r"\b(\d{1,2}):([0-5]\d)\b")
# 1 225 / 1 225 (espace fine) / 11,3 / 0.85 — jamais la partie d'un mm:ss (exclu
# en retirant les horloges du texte au préalable).
_NUM_RE = re.compile(r"\d{1,3}(?:[\s  ]\d{3})+|\d+(?:[.,]\d+)?")
_SPACES = str.maketrans({" ": "", " ": "", " ": ""})

# Tolérances de rapprochement d'un nombre cité à une valeur du payload.
EXACT_EPS = 0.05          # écart d'arrondi d'affichage
# Tolérance d'arrondi calibrée par contrôle négatif (cf. tests/test_grounding.py) :
# à 5 % le détecteur ne repérait que 56 % des chiffres falsifiés, à 1 % il en
# repère 93 % sans perdre les citations légitimes (95 % d'ancrage réel).
ROUNDED_REL = 0.01
CLOCK_NEAR_S = 30         # horodatage voisin d'un événement réel


def cited_numbers(text: str) -> list[tuple[str, float, str]]:
    """[(brut, valeur, unité)] du texte, horloges exclues."""
    stripped = _CLOCK_RE.sub(" ", text)
    matches = list(_NUM_RE.finditer(stripped))
    if not matches:
        return []
    # Les états d'unité ne servent qu'aux nombres SANS mot d'unité collé, soit
    # une minorité des textes : ils sont construits à la première demande, et
    # parcourus par un curseur unique (les nombres arrivent par position
    # croissante, un re-balayage depuis le début serait quadratique).
    states, cursor, current = None, 0, None
    out = []
    for m in matches:
        raw = m.group(0)
        try:
            value = float(raw.translate(_SPACES).replace(",", "."))
        except ValueError:
            continue
        unit = unit_of_citation(stripped[m.end():m.end() + 8])
        if unit == ANY:
            # Sans mot d'unité collé au nombre : les blocs `damage` et
            # `consequences` sont souvent cités bruts, le mot-clé désignant
            # dégâts/gold arrivant AVANT le nombre plutôt qu'après (« dégâts
            # Baron 1043, Ahri 591 », « team_gold_swing_90s -7737 »), parfois
            # à des dizaines de caractères (une énumération). Le curseur sur
            # `_unit_states` retient le dernier mot-clé rencontré DANS LA MÊME
            # PHRASE, sans limite de distance arbitraire mais borné à la clause
            # en cours (`_BREAK_RE`) : le nombre devient spécifiquement `dmg`
            # ou `g`, jamais les deux à la fois, et jamais au-delà d'un point/
            # point-virgule. C'est ce qui évite la collision qu'un simple
            # ajout de `dmg`+`g` au repli générique ANY recréait (un dégât
            # inventé tombant par coïncidence près d'un gold sans rapport) :
            # sans mot-clé dans la phrase, le nombre reste ANY.
            if states is None:
                states = _unit_states(stripped, [mm.span() for mm in matches])
            while cursor < len(states) and states[cursor][0] <= m.start():
                current = states[cursor][1]
                cursor += 1
            unit = current or ANY
        out.append((raw, value, unit))
    return out


# Mots-clés d'unité cherchés dans la phrase courante : bornés aux deux
# familles concernées (dégâts, écart de gold d'équipe), et purgés des faux-amis
# ambigus. « dommage » a été RETIRÉ : en français courant c'est d'abord une
# interjection (« Dommage, tu perds la lane... ») et non le concept de jeu, ce
# qui aurait fait déclencher `dmg` sur la seule foi d'une exclamation. « gold »
# seul a été resserré en « gold_swing » : le mot-clé bare matchait aussi
# `gold_state` (dénombrement, pas un montant) et aurait fait dériver l'état
# vers `g` pour tout nombre qui suit dans la même phrase.
_UNIT_TRIGGERS = (
    (("dégât", "degat", "damage", "dmg", "inflige", "subis"), "dmg"),
    (("gold_swing",), "g"),
)
_TRIGGER_UNIT = {kw: unit for keywords, unit in _UNIT_TRIGGERS for kw in keywords}
# Alternation la plus longue d'abord : un mot-clé préfixe d'un autre ne doit pas
# gagner à sa place.
_TRIGGER_RE = re.compile(
    "|".join(re.escape(kw) for kw in sorted(_TRIGGER_UNIT, key=len, reverse=True)),
    re.I)
# Point/point-virgule : fin de phrase, remise à zéro INCONDITIONNELLE.
# Virgule : remise à zéro par défaut (une clause introduit un sujet différent,
# cf. relecture tour 3 : « Tu subis 1230 de dégâts..., ta CS tombe à 45 » ne
# doit PAS laisser « dégâts » gouverner la CS ni l'XP d'une clause suivante).
# SEULE exception : la virgule qui enchaîne une énumération « (Nom) Valeur »
# (ex. « dégâts Baron 1043, Ahri 591, Syndra 599 » ou « 609 auto + 1 099
# sorts ») telle que le payload la fournit (`damage.top_sources`) — dans CE cas
# précis, et uniquement celui-là, le mot-clé précédent continue de s'appliquer
# à travers la virgule. Un nom propre (« Ahri ») est optionnel : un chiffre nu
# juste après la virgule (sans verbe ni nouveau sujet) reste une énumération.
_ENUM_CONTINUATION_RE = re.compile(r"^(?:[A-ZÀ-Ý][\wÀ-ÿ']*\s+)?\d")
_BREAK_RE = re.compile(r"[.;,]")


def _unit_states(stripped: str,
                 number_spans: list[tuple[int, int]]) -> list[tuple[int, str | None]]:
    """[(position, unité en vigueur À PARTIR de cette position)], triée. L'unité
    change à chaque mot-clé `_UNIT_TRIGGERS` et se réinitialise à `None` à
    chaque limite de phrase ou de clause, pour qu'un mot-clé ne « fuie » jamais
    vers une clause suivante sans rapport.

    `number_spans` sont les bornes déjà repérées par `_NUM_RE` chez l'appelant :
    une virgule DÉCIMALE (« 46,7 ») tombe À L'INTÉRIEUR de l'une d'elles et
    n'est pas une limite de clause, sous peine de couper une énumération en
    plein milieu d'un pourcentage."""
    events: list[tuple[int, str | None]] = [
        (m.start(), _TRIGGER_UNIT[m.group(0).lower()])
        for m in _TRIGGER_RE.finditer(stripped)
    ]
    for m in _BREAK_RE.finditer(stripped):
        pos = m.start()
        if m.group(0) == "," and (
            any(start <= pos < end for start, end in number_spans)
            or _ENUM_CONTINUATION_RE.match(stripped[m.end():m.end() + 24].lstrip())
        ):
            continue
        events.append((pos, None))
    events.sort(key=lambda e: e[0])
    return [(0, None)] + events


def cited_clocks(text: str) -> list[str]:
    return [f"{int(m.group(1))}:{m.group(2)}" for m in _CLOCK_RE.finditer(text)]


# --- valeurs disponibles dans le payload -------------------------------------
#
# Rapprocher un chiffre cité de N'IMPORTE quelle valeur du payload ne prouve rien :
# un journal de game contient des centaines de nombres, et un contrôle négatif
# (falsifier les chiffres d'une review réelle) ne détectait que ~30 % des
# falsifications. On indexe donc les valeurs PAR UNITÉ, et un « 1 225 g » ne peut
# s'ancrer que sur un champ de gold, pas sur un timestamp qui passait par là.

UNITS = ("g", "cs", "pct", "dmg", "s", "min", "u", "n", "morts")
ANY = "any"

# Unité déduite du nom de champ. Ordre significatif : le premier motif gagne.
_KEY_UNITS = (
    (("damage", "_dmg"), "dmg"),
    (("gold", "gd10", "gd14", "gd20", "cost", "price"), "g"),
    (("csd", "cs_", "creep"), "cs"),
    (("delta_s", "dead_time", "duration_s", "_seconds"), "s"),
    (("minute", "duration_min"), "min"),
    (("depth", "dist"), "u"),
    (("level", "kills", "deaths", "assists", "items_bought", "n_games",
      "wards", "count"), "n"),
)
# `"unit"` déclarée par les signaux du payload agrégé -> bloc de valeurs.
_DECLARED_UNITS = {"g": "g", "cs": "cs", "s": "s", "u": "u", "pct": "pct",
                   "dmg": "dmg", "min": "min", "ward": "n", "n": "n"}
# Champs internes jamais cités tels quels : les inclure gonflait l'espace des
# valeurs plausibles sans qu'un coach puisse légitimement les citer.
_IGNORED_KEYS = ("t_ms",)
_UNGROUNDED_SUBTREES = ("game_review_causes", "axes")


def _unit_of(key: str) -> str | None:
    low = key.lower()
    for patterns, unit in _KEY_UNITS:
        if any(pattern in low for pattern in patterns):
            return unit
    return None


def _walk(node, key: str, out: dict[str, set[float]], inherited: str | None = None) -> None:
    """L'unité se transmet du parent à l'enfant : le payload agrégé range les
    valeurs sous `{"gd14": {"me": .., "ref": .., "delta": ..}}`, et lire l'unité
    sur la feuille (`me`) rangeait des gold parmi les dénombrements."""
    if key in _UNGROUNDED_SUBTREES:
        return
    if isinstance(node, bool) or node is None:
        return
    own = _unit_of(key) if key else None
    if isinstance(node, (int, float)):
        if key in _IGNORED_KEYS:
            return
        value = abs(float(node))
        # Une valeur strictement fractionnaire est une part, quel que soit le nom
        # du champ : `death_gold_state.ahead = 0.2538` porte « gold » dans son
        # chemin sans être un montant d'or.
        unit = "pct" if 0.0 < value < 1.0 else (own or inherited or "n")
        out[unit].add(value)
        if unit == "pct":
            out["pct"].add(round(value * 100, 4))
        return
    if isinstance(node, dict):
        # Le payload agrégé DÉCLARE l'unité de chaque signal (`"unit": "g"`) :
        # une déclaration explicite prime sur l'heuristique de nom de champ.
        declared = _DECLARED_UNITS.get(node.get("unit")) if isinstance(
            node.get("unit"), str) else None
        for child_key, child in node.items():
            _walk(child, child_key, out, declared or own or inherited)
        return
    if isinstance(node, list):
        for child in node:
            _walk(child, key, out, own or inherited)


def _strings_and_keys(node, key: str = "") -> list[str]:
    """Textes du payload : les noms de métriques portent des nombres (`gd14`,
    « cs diff @10 ») qu'une evidence cite légitimement."""
    if key in _UNGROUNDED_SUBTREES:
        return []
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [k for k in node] + [t for child_key, child in node.items()
                                    for t in _strings_and_keys(child, child_key)]
    if isinstance(node, list):
        return [t for child in node for t in _strings_and_keys(child, key)]
    return []


def _add_derived(payload: dict, out: dict[str, set[float]]) -> None:
    """Dénombrements et parts dérivables du journal : « 4 morts en BOT »,
    « 60 % de tes morts », « avant la 12e minute » sont ancrés sans figurer
    tels quels dans le payload."""
    journal = payload.get("journal") or {}
    kda = ((payload.get("meta") or {}).get("kda") or {})
    if isinstance(kda.get("deaths"), (int, float)):
        out["morts"].add(float(kda["deaths"]))
    for name in ("deaths", "recalls"):
        rows = [r for r in (journal.get(name) or []) if isinstance(r, dict)]
        total = len(rows)
        out["n"].add(float(total))
        # « 4 morts en BOT » est la citation la plus fréquente d'un dénombrement :
        # la cloisonner évite qu'elle s'ancre sur un niveau ou un nombre de kills.
        counted = out["morts"] if name == "deaths" else out["n"]
        counted.add(float(total))
        groups = [Counter(r.get(field) for r in rows)
                  for field in ("zone", "phase", "gold_state",
                                "killer_champ", "killer_role")]
        groups.append(Counter((r.get("zone"), r.get("phase")) for r in rows))
        for counts in groups:
            for count in counts.values():
                out["n"].add(float(count))
                counted.add(float(count))
                if total:
                    out["pct"].add(round(100.0 * count / total, 4))
        for row in rows:
            clock = row.get("clock")
            if clock:
                minutes, seconds = clock.split(":")
                out["min"].add(float(int(minutes) + (1 if int(seconds) else 0)))


# Constantes de FENÊTRE DE FEATURE des blocs `consequences` (définies dans
# `game_journal.py`, jamais une valeur du payload). `team_gold_swing_90s` porte
# sa fenêtre dans le NOM de la clé (« _90s »), pas dans une valeur citable : un
# coach qui écrit « swing mesuré sur 90 secondes » décrit la DÉFINITION de la
# feature, pas un chiffre du journal. Chacune n'est ajoutée QUE si le bloc
# qu'elle définit est réellement présent dans CE payload :
# sinon un payload sans `consequences` citerait légitiment « 90 s » sans
# qu'aucune feature de ce nom n'y existe. PAS de règle générique qui ancrerait
# tout nombre trouvé dans un nom de clé (la porte ouverte que le cloisonnement
# par unité interdit) : seules ces deux constantes précises, nommément listées.
_FEATURE_WINDOWS = (
    (game_journal.GOLD_SWING_KEY, game_journal.GOLD_SWING_WINDOW_S),
    ("objectives_lost", game_journal.CONSEQUENCE_WINDOW_S),
    ("buildings_lost", game_journal.CONSEQUENCE_WINDOW_S),
)


def payload_index(payload: dict) -> dict[str, set[float]]:
    """{unité: valeurs citables}. `ANY` reste le repli des citations sans unité
    explicite, et porte en plus les nombres des NOMS de métriques (`@14`)."""
    out: dict[str, set[float]] = {unit: set() for unit in UNITS}
    _walk(payload, "", out)
    _add_derived(payload, out)
    # Une seule collecte des textes/noms de clés : elle sert à la fois aux
    # nombres portés par les noms de métriques et à la présence des marqueurs
    # de `_FEATURE_WINDOWS` (un parcours récursif par marqueur en plus était du
    # travail pur perdu).
    texts = _strings_and_keys(payload)
    names: set[float] = set()
    for text in texts:
        names.update(abs(value) for _, value, _ in cited_numbers(text))
    out[ANY] = names
    present = set(texts)
    for marker, seconds in _FEATURE_WINDOWS:
        if marker in present:
            out["s"].add(float(seconds))
    return out


def payload_clocks(payload: dict) -> set[str]:
    """Horloges disponibles dans TOUT le payload : pas seulement `journal.deaths`
    et `journal.recalls`, mais aussi les blocs `consequences` enrichis
    (objectifs et bâtiments perdus après une mort) qui portent chacun leur
    propre `clock`. Toute clé `clock` du payload est une horloge légitimement
    citable, où qu'elle se trouve."""
    out: set[str] = set()
    _collect_clocks(payload, "", out)
    return out


def _collect_clocks(node, key: str, out: set[str]) -> None:
    if key in _UNGROUNDED_SUBTREES:
        return
    if isinstance(node, dict):
        clock = node.get("clock")
        if isinstance(clock, str):
            out.add(clock)
        for child_key, child in node.items():
            _collect_clocks(child, child_key, out)
    elif isinstance(node, list):
        for child in node:
            _collect_clocks(child, key, out)


def _clock_seconds(clock: str) -> int:
    minutes, seconds = clock.split(":")
    return int(minutes) * 60 + int(seconds)


# Unité portée par le texte qui suit immédiatement le nombre.
_EXACT_SUFFIXES = {"g": "g", "or": "g", "cs": "cs", "s": "s",
                   "dmg": "dmg"}
_PREFIX_SUFFIXES = (("sec", "s"), ("min", "min"), ("unit", "u"),
                    ("dégât", "dmg"), ("degat", "dmg"), ("damage", "dmg"),
                    ("mort", "morts"), ("déc", "morts"), ("dec", "morts"))


def unit_of_citation(tail: str) -> str:
    """Unité d'un « 1 225 g » / « 32,7 % » / « 18 s ». Sans unité explicite, la
    citation est un dénombrement ou une minute (« 3 morts », « la 12e minute »)."""
    token = tail.strip().lower()
    if token.startswith("%"):
        return "pct"
    word = re.match(r"[a-zà-ÿ]+", token)
    if word:
        found = word.group(0)
        if found in _EXACT_SUFFIXES:
            return _EXACT_SUFFIXES[found]
        for prefix, unit in _PREFIX_SUFFIXES:
            if found.startswith(prefix):
                return unit
    return ANY


# --- classement d'un nombre / d'une horloge ----------------------------------

def classify_number(value: float, index: dict[str, set[float]],
                    unit: str = ANY) -> str:
    """'exact' | 'arrondi' | 'non_ancre', dans l'unité citée."""
    value = abs(value)
    available = index.get(unit) or set()
    if unit == ANY:
        # Sans unité : un dénombrement, une minute, une distance, ou le nombre
        # porté par un nom de métrique (« gd14 », « @20 »). Une fraction brute
        # (« 0,29 des morts ») reste rapprochable du bloc de pourcentages.
        # `dmg`/`g` n'y figurent PAS : un nombre réellement sans mot-clé à
        # proximité (`cited_numbers`/`_unit_states`) reste ici, et ne doit PAS
        # chercher dans les blocs de dégâts/gold, sous peine de recréer la
        # collision qu'un ajout précédent avait introduite (un dégât inventé
        # rapproché par coïncidence d'un gold sans rapport). Les citations de
        # `dmg`/`g` sans mot d'unité collé sont déjà résolues EN AMONT, dans
        # `cited_numbers`, à la faveur d'un mot-clé trouvé à proximité : elles
        # arrivent ici avec `unit == "dmg"` ou `"g"`, jamais `ANY`.
        buckets = ["n", "min", "u", ANY] + (["pct"] if value < 1 else [])
        available = set().union(*(index.get(b) or set() for b in buckets))
    elif unit == "min":
        # « gold diff @14 » : le repère de minute vient du NOM de la métrique.
        available = available | (index.get(ANY) or set())
    best = min((abs(value - c) for c in available), default=None)
    if best is None:
        return "non_ancre"
    if best <= EXACT_EPS:
        return "exact"
    if best <= max(EXACT_EPS, ROUNDED_REL * abs(value)):
        return "arrondi"
    # Une part dérivée s'énonce en entier (« 22 % de tes morts » pour 2/9 = 22,2).
    if value == int(value) and any(round(c) == value for c in available):
        return "arrondi"
    return "non_ancre"


def classify_clock(clock: str, available: set[str]) -> str:
    if clock in available:
        return "exact"
    if not available:
        return "non_ancre"
    ref = _clock_seconds(clock)
    if min(abs(ref - _clock_seconds(c)) for c in available) <= CLOCK_NEAR_S:
        return "voisin"
    return "non_ancre"


# --- asymétrie : une observation descriptive n'est jamais une faute ----------

# Les features `descriptive_only` du payload (profondeur de carte, over-extension)
# corrèlent au rang INFÉRIEUR : les prescrire inverserait le conseil.
DESCRIPTIVE_TERMS = ("profondeur", "over-extend", "overextens", "surextension",
                     "sur-extension")
PRESCRIPTIVE_SECTIONS = ("mistakes", "habits", "next_focus")


def asymmetry_violations(review: dict) -> list[str]:
    out = []
    for section in PRESCRIPTIVE_SECTIONS:
        for text in _texts(review.get(section)):
            low = text.lower()
            for term in DESCRIPTIVE_TERMS:
                if term in low:
                    out.append(f"{section}: « {text[:90]} »")
                    break
    return out


def _texts(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [v for k, v in node.items()
                if isinstance(v, str) and k in ("point", "cause", "evidence")]
    if isinstance(node, list):
        return [t for child in node for t in _texts(child)]
    return []


# --- rapport ------------------------------------------------------------------

def _insight_texts(review: dict) -> list[str]:
    """Textes porteurs de preuve. `point` est la leçon (formulation libre),
    `evidence` et `cause` sont les seuls tenus d'être ancrés."""
    out = []
    for section in ("strengths", "mistakes"):
        for insight in review.get(section) or []:
            if isinstance(insight, dict):
                out += [insight[k] for k in ("evidence", "cause")
                        if isinstance(insight.get(k), str)]
    return out


def check_review(record: dict) -> dict:
    payload, review = record.get("payload") or {}, record.get("review") or {}
    index, clocks = payload_index(payload), payload_clocks(payload)
    numbers, times = [], []
    for text in _insight_texts(review):
        for raw, value, unit in cited_numbers(text):
            numbers.append({"raw": f"{raw} {unit}".strip(), "unit": unit,
                            "status": classify_number(value, index, unit)})
        for clock in cited_clocks(text):
            times.append({"raw": clock, "status": classify_clock(clock, clocks)})
    return {
        "ts": record.get("ts"),
        "kind": record.get("kind", "aggregate"),
        "match_id": record.get("match_id"),
        "model": record.get("model"),
        "prompt_version": (record.get("run") or {}).get("prompt_version"),
        "numbers": numbers,
        "clocks": times,
        "asymmetry_violations": asymmetry_violations(review),
    }


def _rate(rows: list[dict], good: tuple[str, ...]) -> float | None:
    return (sum(1 for r in rows if r["status"] in good) / len(rows)) if rows else None


def score(check: dict) -> dict:
    return {
        "n_numbers": len(check["numbers"]),
        "grounded_rate": _rate(check["numbers"], ("exact", "arrondi")),
        "exact_rate": _rate(check["numbers"], ("exact",)),
        "n_clocks": len(check["clocks"]),
        "clock_rate": _rate(check["clocks"], ("exact", "voisin")),
        "clock_exact_rate": _rate(check["clocks"], ("exact",)),
        "n_asymmetry_violations": len(check["asymmetry_violations"]),
    }


def report(player: str, root=None, kind: str | None = None,
           prompt_version: str | None = None) -> dict:
    records = feedback_mod.list_reviews(player, root)
    if kind:
        records = [r for r in records
                   if (r.get("kind") or "aggregate") == kind]
    if prompt_version:
        # Cohorte résolue par `feedback.prompt_cohort` : le sentinelle "none"
        # (reviews d'avant le bloc `run`) n'est défini qu'à cet endroit-là.
        records = [r for r in records
                   if feedback_mod.prompt_cohort(r) == prompt_version]
    checks = [check_review(r) for r in records]
    numbers = [n for c in checks for n in c["numbers"]]
    clocks = [c for check in checks for c in check["clocks"]]
    return {
        "player": player,
        "prompt_version": prompt_version,
        "n_reviews": len(checks),
        "numbers": {"n": len(numbers),
                    "grounded_rate": _rate(numbers, ("exact", "arrondi")),
                    "exact_rate": _rate(numbers, ("exact",)),
                    "by_status": dict(Counter(n["status"] for n in numbers))},
        "clocks": {"n": len(clocks),
                   "anchored_rate": _rate(clocks, ("exact", "voisin")),
                   "exact_rate": _rate(clocks, ("exact",)),
                   "by_status": dict(Counter(c["status"] for c in clocks))},
        "n_asymmetry_violations": sum(len(c["asymmetry_violations"]) for c in checks),
        "reviews": [{**{k: c[k] for k in ("ts", "kind", "match_id", "model",
                                          "prompt_version")},
                     **score(c)} for c in checks],
        "offenders": [{"ts": c["ts"], "match_id": c["match_id"],
                       "numbers": [n["raw"] for n in c["numbers"]
                                   if n["status"] == "non_ancre"],
                       "clocks": [t["raw"] for t in c["clocks"]
                                  if t["status"] == "non_ancre"],
                       "asymmetry": c["asymmetry_violations"]}
                      for c in checks
                      if any(n["status"] == "non_ancre" for n in c["numbers"])
                      or any(t["status"] == "non_ancre" for t in c["clocks"])
                      or c["asymmetry_violations"]],
    }


def render(rep: dict, details: bool = False) -> str:
    pct = lambda v: "—" if v is None else f"{v:.0%}"
    lines = [f"ANCRAGE — {rep['player']} ({rep['n_reviews']} reviews)",
             f"  Chiffres ancrés  {pct(rep['numbers']['grounded_rate'])} "
             f"({rep['numbers']['n']} cités, dont exacts "
             f"{pct(rep['numbers']['exact_rate'])})",
             f"  Horodatages      {pct(rep['clocks']['anchored_rate'])} "
             f"({rep['clocks']['n']} cités, dont exacts "
             f"{pct(rep['clocks']['exact_rate'])})",
             f"  Asymétrie        {rep['n_asymmetry_violations']} violation(s) "
             f"(observation descriptive présentée comme une faute)"]
    if details and rep["offenders"]:
        lines.append("\nÉléments non ancrés :")
        for off in rep["offenders"]:
            what = off["match_id"] or "agrégée"
            lines.append(f"  {off['ts']} | {what}")
            if off["numbers"]:
                lines.append(f"      chiffres : {', '.join(off['numbers'])}")
            if off["clocks"]:
                lines.append(f"      horaires : {', '.join(off['clocks'])}")
            for violation in off["asymmetry"]:
                lines.append(f"      asymétrie : {violation}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="grounding.py", description=__doc__)
    ap.add_argument("--player", default="spadzze")
    ap.add_argument("--kind", choices=["game", "aggregate"], default=None)
    ap.add_argument("--prompt-version", default=None,
                    help="filtre une cohorte de prompt ('none' = reviews sans run)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--details", action="store_true",
                    help="liste les chiffres et horodatages non ancrés")
    args = ap.parse_args(argv)
    rep = report(args.player, kind=args.kind, prompt_version=args.prompt_version)
    print(json.dumps(rep, ensure_ascii=False, indent=2) if args.json
          else render(rep, args.details))
    return 0


if __name__ == "__main__":
    sys.exit(main())
