# Coaching par-game enrichi : recalls jugés, tracking jungle, erreurs catégorisées

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au coach par-game la matière déterministe pour juger un recall (CS perdues, objets finis, spike adverse), instruire une mort par gank (indices publics du jungler, support, tourelle amie debout), et produire des erreurs découpées, titrées et comptables.

**Architecture:** Deux modules purs nouveaux (`src/core/journal_signals.py` pour les dérivations, `src/core/turrets.py` pour la table de tourelles reconstituée depuis le raw) ; `game_journal.py` reste l'assembleur et gagne un paramètre `items` optionnel ; le schéma de sortie gagne `category` (liste fermée) et `title` (60 caractères), et passe de 3 à 5 erreurs ; l'éval (grounding, feedback, evaluation.ts, counterfactual) suit les blocs neufs.

**Tech Stack:** Python 3 (stdlib + Pydantic v2), pytest, TypeScript (Worker Cloudflare), Alpine.js (frontend statique), Poetry.

**Spec:** `docs/superpowers/specs/2026-09-05-coaching-recalls-tracking-categories-design.md`

## Global Constraints

- **Asymétrie** : tout champ ajouté au journal est une information que le joueur AVAIT (kill feed, annonces d'objectif et de tourelle, scoreboard, sa position, la position minimap de son allié). Interdits : `WARD_KILL` adverses, toute position ennemie hors événement public, tout proxy `ML_ONLY` de `positioning.py` (`frac_deaths_in_fog`, `avg_unaccounted_enemies`, `overext_x_unaccounted`).
- **0 appel à l'API Riot** : tout se dérive du raw déjà caché (`rl._read_raw`).
- **Français, tutoiement. Jamais de tiret cadratin (—)**, ni dans le code, ni dans les commentaires, ni dans les chaînes de prompt, ni dans les messages de commit.
- **Lancer depuis la racine avec `poetry run`.** Convention d'import plat : chaque script insère `src/core/` dans `sys.path` avant d'importer.
- **`data/` n'est jamais commité**, sauf les deux configurations source force-add : `data/00_static/champion_traits.json` et, désormais, `data/00_static/sr_turrets.json`. Jamais de `git add -A` : toujours des chemins explicites.
- **TDD** : le test avant l'implémentation, à chaque dérivation nouvelle.
- **`poetry run pytest tests/`** et **`make demo`** doivent rester verts à la fin de chaque tâche.
- Constantes documentées en tête de module, jamais en dur dans une fonction : `FINISHED_MIN_COST = 1600`, `SPIKE_WINDOW_S = 120`, `RECALL_DEATH_WINDOW_S = 90`, `CS_WINDOW_MIN = 2`, `CS_PRECISION = 2`.
- Une clé de journal vide est **omise**, jamais rendue à `null` (convention de `consequences`).

---

### Task 1: Table des tourelles (`turrets.py` + `build_turret_map.py`)

**Files:**
- Create: `src/core/turrets.py`
- Create: `src/pipeline_ops/build_turret_map.py`
- Create (généré, force-add) : `data/00_static/sr_turrets.json`
- Test: `tests/test_turret_map.py`

**Interfaces:**
- Consumes: `riotlib._read_raw`, `riotlib.raw_dir`, `champion_profiles.STATIC_DIR`.
- Produces:
  - `turrets.load(static_dir=None) -> list[dict]` avec `{"team": int, "lane": str, "tier": str, "x": int, "y": int}`
  - `turrets.destroyed_at(events, t_ms) -> set[tuple[int, str, str]]`
  - `turrets.nearest_standing(x, y, my_team, destroyed, table=None) -> dict | None` avec `{"lane", "tier", "distance"}`
  - `turrets.own_outer(my_team, lane, destroyed, table=None) -> dict | None`
  - `build_turret_map.collect(timelines) -> dict[str, list[tuple[int, int]]]`
  - `build_turret_map.EXPECTED_KEYS = 20`, `build_turret_map.EXPECTED_POSITIONS = 22`

- [ ] **Step 1: Écrire les tests d'échec**

Créer `tests/test_turret_map.py` :

```python
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "pipeline_ops"))

import build_turret_map as B
import turrets as T


def _kill(team, lane, tier, x, y, t_ms=600000):
    return {"type": "BUILDING_KILL", "timestamp": t_ms, "teamId": team,
            "laneType": lane, "towerType": tier, "buildingType": "TOWER_BUILDING",
            "position": {"x": x, "y": y}}


def _timeline(events):
    return {"info": {"frames": [{"timestamp": 0, "events": events,
                                 "participantFrames": {}}]}}


def _full_events():
    """Les 20 cles / 22 positions de la Faille, positions arbitraires mais distinctes."""
    out, n = [], 0
    for team in (100, 200):
        for lane in ("TOP_LANE", "MID_LANE", "BOT_LANE"):
            for tier in ("OUTER_TURRET", "INNER_TURRET", "BASE_TURRET"):
                n += 1
                out.append(_kill(team, lane, tier, 1000 + n, 2000 + n))
        out.append(_kill(team, "MID_LANE", "NEXUS_TURRET", 500 + team, 600 + team))
        out.append(_kill(team, "MID_LANE", "NEXUS_TURRET", 700 + team, 800 + team))
    return out


def test_collect_accepts_two_positions_for_nexus_turret():
    table = B.build([_timeline(_full_events())])
    assert len({(r["team"], r["lane"], r["tier"]) for r in table}) == B.EXPECTED_KEYS
    assert len(table) == B.EXPECTED_POSITIONS


def test_build_fails_on_conflicting_position_for_a_simple_turret():
    events = _full_events() + [_kill(100, "TOP_LANE", "OUTER_TURRET", 9999, 9999)]
    with pytest.raises(SystemExit):
        B.build([_timeline(events)])


def test_build_fails_on_incomplete_sample():
    events = _full_events()[:5]
    with pytest.raises(SystemExit):
        B.build([_timeline(events)])


def test_destroyed_at_is_a_snapshot_of_the_instant():
    events = [_kill(100, "BOT_LANE", "OUTER_TURRET", 10504, 1029, t_ms=600000)]
    assert T.destroyed_at(events, 599999) == set()
    assert T.destroyed_at(events, 600001) == {(100, "BOT_LANE", "OUTER_TURRET")}


def test_nearest_standing_ignores_a_fallen_turret():
    table = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
              "x": 10500, "y": 1000},
             {"team": 100, "lane": "BOT_LANE", "tier": "INNER_TURRET",
              "x": 7000, "y": 1000}]
    near = T.nearest_standing(10400, 1000, 100, set(), table=table)
    assert near["tier"] == "OUTER_TURRET" and near["distance"] == 100
    fallen = {(100, "BOT_LANE", "OUTER_TURRET")}
    assert T.nearest_standing(10400, 1000, 100, fallen, table=table)["tier"] == "INNER_TURRET"


def test_nearest_standing_ignores_enemy_turrets():
    table = [{"team": 200, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
              "x": 10500, "y": 1000}]
    assert T.nearest_standing(10400, 1000, 100, set(), table=table) is None


def test_own_outer_returns_none_when_fallen():
    table = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
              "x": 10500, "y": 1000}]
    assert T.own_outer(100, "BOT_LANE", set(), table=table)["x"] == 10500
    assert T.own_outer(100, "BOT_LANE",
                       {(100, "BOT_LANE", "OUTER_TURRET")}, table=table) is None


def test_load_reads_the_static_file(tmp_path):
    rows = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
             "x": 10504, "y": 1029}]
    (tmp_path / "sr_turrets.json").write_text(json.dumps(rows))
    T.load.cache_clear()
    assert T.load(tmp_path) == rows
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_turret_map.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'turrets'`

- [ ] **Step 3: Écrire `src/core/turrets.py`**

```python
"""Table des tourelles de la Faille de l'invocateur (module pur, 0 I/O reseau).

Riot ne publie pas les coordonnees des tourelles, mais chaque `BUILDING_KILL`
porte sa `position` : la table est donc DERIVEE du raw par
`src/pipeline_ops/build_turret_map.py`, jamais ecrite de memoire.

Une tourelle detruite ne protege plus personne : toutes les fonctions de
proximite prennent l'ensemble des tourelles deja tombees a l'instant considere
et ne repondent que sur celles encore debout.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

FILENAME = "sr_turrets.json"


@lru_cache(maxsize=4)
def load(static_dir=None) -> list[dict]:
    """Table des tourelles. Liste vide si le fichier est absent (degradation propre :
    les blocs qui en dependent sont alors simplement omis du journal)."""
    if static_dir is None:
        import champion_profiles as cp
        static_dir = cp.STATIC_DIR
    path = Path(static_dir) / FILENAME
    if not path.exists():
        return []
    return json.loads(path.read_text())


def key_of(row: dict) -> tuple[int, str, str]:
    return (row["team"], row["lane"], row["tier"])


def destroyed_at(events, t_ms: int) -> set[tuple[int, str, str]]:
    """Cles des tourelles deja tombees a t_ms.

    Semantique timeline : `BUILDING_KILL.teamId` = equipe qui PERD le batiment,
    c'est donc bien la cle de la tourelle detruite (meme convention que
    `game_journal._consequences`).
    """
    out = set()
    for ev in events:
        if ev.get("type") != "BUILDING_KILL":
            continue
        if ev.get("timestamp", 0) > t_ms:
            continue
        tier = ev.get("towerType")
        if not tier:
            continue
        out.add((ev.get("teamId"), ev.get("laneType"), tier))
    return out


def _standing(my_team: int, destroyed: set, table: list[dict] | None):
    rows = table if table is not None else load()
    return [r for r in rows
            if r["team"] == my_team and key_of(r) not in destroyed]


def nearest_standing(x: float, y: float, my_team: int, destroyed: set,
                     table: list[dict] | None = None) -> dict | None:
    """Tourelle AMIE encore debout la plus proche, ou None."""
    best = None
    for row in _standing(my_team, destroyed, table):
        d = ((row["x"] - x) ** 2 + (row["y"] - y) ** 2) ** 0.5
        if best is None or d < best[0]:
            best = (d, row)
    if best is None:
        return None
    d, row = best
    return {"lane": row["lane"], "tier": row["tier"], "distance": round(d)}


def own_outer(my_team: int, lane: str, destroyed: set,
              table: list[dict] | None = None) -> dict | None:
    """Tourelle exterieure encore debout de ma propre lane (repere de prise de risque)."""
    for row in _standing(my_team, destroyed, table):
        if row["lane"] == lane and row["tier"] == "OUTER_TURRET":
            return row
    return None
```

- [ ] **Step 4: Écrire `src/pipeline_ops/build_turret_map.py`**

```python
#!/usr/bin/env python3
"""Reconstitue la table des tourelles de la Faille depuis le raw cache. 0 appel API.

Chaque `BUILDING_KILL` porte la position du batiment detruit : balayer N timelines
suffit a retrouver les 20 cles (2 equipes x 3 lanes x 3 paliers + la paire de
tourelles de nexus) et leurs 22 positions.

Le script ECHOUE plutot que d'ecrire une table douteuse :
- une cle simple observee a deux positions differentes = remaniement de carte ;
- un echantillon incomplet = `nearest_standing` repondrait sur une carte trouee.

Usage : poetry run python3 src/pipeline_ops/build_turret_map.py [--limit 200] [--dry-run]
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
import champion_profiles as cp   # noqa: E402
import riotlib as rl             # noqa: E402
import turrets as T              # noqa: E402

EXPECTED_KEYS = 20          # 2 equipes x (3 lanes x 3 paliers + nexus)
EXPECTED_POSITIONS = 22     # les deux tourelles de nexus partagent leur cle
NEXUS_TIER = "NEXUS_TURRET"
DEFAULT_LIMIT = 200


def collect(timelines) -> dict[tuple[int, str, str], set[tuple[int, int]]]:
    """{cle de tourelle: positions observees}."""
    out: dict[tuple[int, str, str], set] = defaultdict(set)
    for timeline in timelines:
        for ev in rl.iter_events(timeline):
            if ev.get("type") != "BUILDING_KILL":
                continue
            tier = ev.get("towerType")
            pos = ev.get("position") or {}
            if not tier or pos.get("x") is None or pos.get("y") is None:
                continue
            out[(ev.get("teamId"), ev.get("laneType"), tier)].add(
                (int(pos["x"]), int(pos["y"])))
    return out


def build(timelines) -> list[dict]:
    """Table validee, triee. Sort en erreur sur position multiple ou echantillon incomplet."""
    seen = collect(timelines)
    for (team, lane, tier), positions in sorted(seen.items()):
        limit = 2 if tier == NEXUS_TIER else 1
        if len(positions) > limit:
            sys.exit(f"✗ {team}/{lane}/{tier} observe a {len(positions)} positions "
                     f"(max {limit}) : remaniement de carte, table non ecrite.")
    n_positions = sum(len(p) for p in seen.values())
    if len(seen) != EXPECTED_KEYS or n_positions != EXPECTED_POSITIONS:
        sys.exit(f"✗ echantillon incomplet : {len(seen)}/{EXPECTED_KEYS} cles, "
                 f"{n_positions}/{EXPECTED_POSITIONS} positions. Augmente --limit.")
    return sorted(
        [{"team": team, "lane": lane, "tier": tier, "x": x, "y": y}
         for (team, lane, tier), positions in seen.items()
         for x, y in sorted(positions)],
        key=T.key_of)


def _timelines(limit: int):
    paths = sorted(rl.raw_dir().glob("*_timeline.json*"))[:limit]
    for path in paths:
        yield rl._read_raw_at(path)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    limit = DEFAULT_LIMIT
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    dry_run = "--dry-run" in argv
    table = build(_timelines(limit))
    dest = cp.STATIC_DIR / T.FILENAME
    print(f"{len(table)} positions / "
          f"{len({T.key_of(r) for r in table})} cles depuis <= {limit} timelines")
    if dry_run:
        print(f"(dry-run) aurait ecrit {dest}")
        return 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(table, indent=1), encoding="utf-8")
    T.load.cache_clear()
    print(f"✓ ecrit {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_turret_map.py -v`
Expected: PASS (9 tests)

- [ ] **Step 6: Générer la vraie table depuis le raw**

Run: `poetry run python3 src/pipeline_ops/build_turret_map.py --limit 200`
Expected: `22 positions / 20 cles depuis <= 200 timelines` puis `✓ ecrit .../sr_turrets.json`.
Si le script échoue sur un échantillon incomplet, relancer avec `--limit 500`. S'il échoue sur une position multiple, NE PAS contourner : le signaler dans le rapport de tâche.

- [ ] **Step 7: Commit (force-add du fichier de configuration source)**

```bash
git add src/core/turrets.py src/pipeline_ops/build_turret_map.py tests/test_turret_map.py
git add -f data/00_static/sr_turrets.json
git commit -m "feat(turrets): table des tourelles derivee du raw, proximite sur tourelles debout"
```

---

### Task 2: `finished` au catalogue d'objets

**Files:**
- Modify: `src/core/champion_profiles.py` (`_parse_items`, en-tête de module)
- Modify: `src/pipeline_ops/build_demo_fixtures.py:155-159` (`trim_items`)
- Test: `tests/test_champion_profiles.py`

**Interfaces:**
- Consumes: rien de neuf.
- Produces: `champion_profiles.load_items()` renvoie `{id: {"name": str, "cost": int | None, "finished": bool}}` ; `champion_profiles.FINISHED_MIN_COST = 1600`.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à la fin de `tests/test_champion_profiles.py` :

```python
def test_finished_item_classification():
    raw = {
        "3094": {"name": "Rapid Firecannon", "gold": {"total": 2600},
                 "tags": ["CriticalStrike"]},                        # legendaire
        "1038": {"name": "B. F. Sword", "gold": {"total": 1300},
                 "into": ["3094"], "tags": ["Damage"]},              # composant
        "3006": {"name": "Berserker's Greaves", "gold": {"total": 1100},
                 "tags": ["Boots"]},                                 # bottes T2
        "2140": {"name": "Elixir of Wrath", "gold": {"total": 1600},
                 "tags": ["Consumable"]},                            # consommable cher
        "6672": {"name": "Kraken Slayer", "gold": {"total": 3100},
                 "into": [""], "tags": ["Damage"]},                  # into vide historique
        "3057": {"name": "Sheen", "gold": {"total": 1600},
                 "into": ["3078"], "tags": ["Damage"]},              # composant >= 1600
    }
    parsed = cp._parse_items(raw)
    assert parsed[3094]["finished"] is True
    assert parsed[6672]["finished"] is True          # `into: [""]` n'est pas un successeur
    assert parsed[1038]["finished"] is False
    assert parsed[3006]["finished"] is False         # sous FINISHED_MIN_COST
    assert parsed[2140]["finished"] is False         # consommable
    assert parsed[3057]["finished"] is False         # a un successeur


def test_parse_items_keeps_name_and_cost():
    parsed = cp._parse_items({"3094": {"name": "RFC", "gold": {"total": 2600}}})
    assert parsed[3094]["name"] == "RFC" and parsed[3094]["cost"] == 2600
```

Ajouter à `tests/test_demo.py` (le test de fixtures) :

```python
def test_trim_items_keeps_what_parse_items_reads():
    """`trim_items` promet de garder ce que `_parse_items` lit : `into` et `tags`
    en font desormais partie, sinon la demo classerait fini tout objet >= 1600."""
    import build_demo_fixtures as B
    raw = {"data": {"1038": {"name": "B. F. Sword", "gold": {"total": 1300},
                             "into": ["3094"], "tags": ["Damage"],
                             "description": "verbeux"}}}
    trimmed = B.trim_items(raw)["data"]["1038"]
    assert trimmed["into"] == ["3094"]
    assert trimmed["tags"] == ["Damage"]
    assert "description" not in trimmed
    assert cp._parse_items({"1038": trimmed})[1038]["finished"] is False
```

`tests/test_demo.py` doit importer ce qu'il faut en tête :

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "pipeline_ops"))
import champion_profiles as cp
```

(si ces imports existent déjà, ne pas les dupliquer)

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_champion_profiles.py tests/test_demo.py -v`
Expected: FAIL avec `KeyError: 'finished'`

- [ ] **Step 3: Implémenter**

Dans `src/core/champion_profiles.py`, au-dessus de `_parse_items` :

```python
# Seuil « objet fini » : ecarte les bottes de tier 2 (1000-1100) et les composants
# sans successeur, tout en gardant les legendaires les moins chers. Un composant
# comme Noonquiver (1200) a de toute facon un `into` non vide.
FINISHED_MIN_COST = 1600
```

et remplacer `_parse_items` :

```python
def _parse_items(raw: dict) -> dict:
    return {int(iid): {"name": it.get("name", f"item_{iid}"),
                       "cost": it.get("gold", {}).get("total"),
                       "finished": _is_finished(it)}
            for iid, it in raw.items()}


def _is_finished(it: dict) -> bool:
    """Objet fini = objet qui donne un spike : aucun successeur, assez cher, non consommable.

    Les chaines vides de `into` sont filtrees : Data Dragon marque certains objets
    finaux d'un `into: [""]` historique, qu'un simple `not into` classerait composant.
    """
    into = [i for i in (it.get("into") or []) if i]
    cost = it.get("gold", {}).get("total") or 0
    return (not into and cost >= FINISHED_MIN_COST
            and "Consumable" not in (it.get("tags") or []))
```

Dans `src/pipeline_ops/build_demo_fixtures.py`, remplacer `trim_items` :

```python
def trim_items(raw: dict) -> dict:
    """Ne garde que ce que `_parse_items` lit : nom, cout total, successeurs, tags.

    `into` et `tags` sont indispensables depuis que le catalogue porte `finished` :
    sans eux la demo classerait fini tout objet >= FINISHED_MIN_COST, une divergence
    prod/demo qu'aucun test de parite ne verrait.
    """
    return {"data": {k: {"name": it.get("name", ""),
                         "gold": {"total": it.get("gold", {}).get("total")},
                         "into": [i for i in (it.get("into") or []) if i],
                         "tags": list(it.get("tags") or [])}
                     for k, it in raw["data"].items()}}
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_champion_profiles.py tests/test_demo.py tests/test_coaching_payload_game.py -v`
Expected: PASS

- [ ] **Step 5: Régénérer les fixtures de démo et vérifier la démo**

Run: `poetry run python3 src/pipeline_ops/build_demo_fixtures.py` puis `make demo`
Expected: les deux réussissent. `tests/fixtures/demo/00_static/ddragon/*/item.json` porte désormais `into` et `tags`.

- [ ] **Step 6: Commit**

```bash
git add src/core/champion_profiles.py src/pipeline_ops/build_demo_fixtures.py tests/test_champion_profiles.py tests/test_demo.py tests/fixtures/demo
git commit -m "feat(items): classification objet fini au catalogue, fixtures demo alignees"
```

---

### Task 3: `journal_signals` volet recalls

**Files:**
- Create: `src/core/journal_signals.py`
- Test: `tests/test_journal_signals.py`

**Interfaces:**
- Consumes: `riotlib.approx_zone`, `positioning._depth` (tâche 4 seulement), `turrets` (tâche 4 seulement).
- Produces (ce volet) :
  - `cs_of_frame(pf) -> int`
  - `cs_baseline(frames_by_min: dict[int, dict], skip_minutes: set[int]) -> float | None`
  - `recall_cs_cost(my_fr, opp_fr, t0_ms, baseline) -> dict | None` (`my_fr`/`opp_fr` = sorties de `riotlib.frames_by_minute`, clé = minute)
  - `classify_visit(item_ids: list[int], catalog: dict) -> dict`
  - `opponent_spike(opp_visits: list[dict], t0_ms: int, catalog: dict) -> dict | None`
  - `death_after_visit(death_ts: list[int], t0_ms: int) -> dict | None`
  - Constantes : `CS_WINDOW_MIN = 2`, `CS_PRECISION = 2`, `SPIKE_WINDOW_S = 120`, `RECALL_DEATH_WINDOW_S = 90`

- [ ] **Step 1: Écrire les tests d'échec**

Créer `tests/test_journal_signals.py` :

```python
import journal_signals as S


def _fr(cs, jungle=0):
    return {"minionsKilled": cs, "jungleMinionsKilled": jungle}


CATALOG = {3094: {"name": "Rapid Firecannon", "cost": 2600, "finished": True},
           1038: {"name": "B. F. Sword", "cost": 1300, "finished": False},
           1083: {"name": "Cull", "cost": 450, "finished": False},
           6672: {"name": "Kraken Slayer", "cost": 3100, "finished": True}}


# --- cout en CS ---------------------------------------------------------------

def test_cs_baseline_excludes_contaminated_minutes():
    """Sans exclusion, la ligne de base integre la perte qu'on cherche a mesurer."""
    # 10 CS/min propre de 0 a 4, puis la minute 5 (recall) coute deux deltas.
    frames = {m: _fr(10 * m) for m in range(0, 5)}
    frames[5] = _fr(41)
    frames[6] = _fr(42)
    assert S.cs_baseline(frames, skip_minutes=set()) == 5.5     # deltas 1 et 1 pesent
    assert S.cs_baseline(frames, skip_minutes={5}) == 10.0      # rythme reel


def test_cs_baseline_is_none_without_usable_minutes():
    assert S.cs_baseline({0: _fr(0)}, skip_minutes=set()) is None


def test_recall_cs_cost_window_and_estimate():
    my = {7: _fr(70), 8: _fr(74), 9: _fr(81)}
    opp = {7: _fr(70), 8: _fr(79), 9: _fr(87)}
    out = S.recall_cs_cost(my, opp, t0_ms=7 * 60000 + 30000, baseline=8.4)
    assert out["window"] == {"from": "7:00", "to": "9:00"}
    assert out["my_cs_gained"] == 11
    assert out["expected_cs"] == 16.8
    assert out["cs_missed_est"] == {"value": 6, "precision_cs": S.CS_PRECISION}
    assert out["opp_cs_gained"] == 17
    assert out["cs_diff_swing"] == -6


def test_recall_cs_cost_omitted_at_end_of_game():
    my = {20: _fr(200), 21: _fr(210)}
    opp = {20: _fr(200), 21: _fr(210)}
    assert S.recall_cs_cost(my, opp, t0_ms=20 * 60000, baseline=10.0) is None


def test_recall_cs_cost_omitted_without_opponent_frames():
    my = {7: _fr(70), 8: _fr(74), 9: _fr(81)}
    assert S.recall_cs_cost(my, {}, t0_ms=7 * 60000, baseline=10.0) is None


def test_recall_cs_cost_never_reports_a_negative_miss():
    my = {7: _fr(70), 8: _fr(82), 9: _fr(95)}
    opp = {7: _fr(70), 8: _fr(78), 9: _fr(86)}
    out = S.recall_cs_cost(my, opp, t0_ms=7 * 60000, baseline=8.0)
    assert out["cs_missed_est"]["value"] == 0
    assert out["cs_diff_swing"] == 9


# --- benefice -----------------------------------------------------------------

def test_classify_visit_detects_a_spike():
    out = S.classify_visit([1038, 3094], CATALOG)
    assert out["gold_spent"] == 3900
    assert out["finished_items"] == [{"id": 3094, "name": "Rapid Firecannon",
                                      "cost": 2600}]
    assert out["is_spike"] is True


def test_classify_visit_without_finished_item():
    out = S.classify_visit([1083, 1038], CATALOG)
    assert out["finished_items"] == []
    assert out["is_spike"] is False
    assert out["gold_spent"] == 1750


def test_classify_visit_is_empty_without_catalog():
    assert S.classify_visit([1083], {}) == {}


# --- contexte adverse et consequence -----------------------------------------

def test_opponent_spike_inside_the_window():
    visits = [{"t_ms": 7 * 60000 + 52000, "clock": "7:52", "item_ids": [6672]}]
    out = S.opponent_spike(visits, t0_ms=7 * 60000 + 38000, catalog=CATALOG)
    assert out == {"clock": "7:52", "delta_s": 14, "items": ["Kraken Slayer"]}


def test_opponent_spike_ignores_visits_outside_the_window():
    visits = [{"t_ms": 10 * 60000, "clock": "10:00", "item_ids": [6672]}]
    assert S.opponent_spike(visits, t0_ms=7 * 60000, catalog=CATALOG) is None


def test_opponent_spike_ignores_visits_without_finished_item():
    visits = [{"t_ms": 7 * 60000 + 10000, "clock": "7:10", "item_ids": [1038]}]
    assert S.opponent_spike(visits, t0_ms=7 * 60000, catalog=CATALOG) is None


def test_death_after_visit_takes_the_first_death_in_the_window():
    deaths = [7 * 60000, 8 * 60000 + 31000, 9 * 60000]
    out = S.death_after_visit(deaths, t0_ms=7 * 60000 + 38000)
    assert out == {"clock": "8:31", "delta_s": 53}


def test_death_after_visit_is_none_beyond_the_window():
    assert S.death_after_visit([10 * 60000], t0_ms=7 * 60000) is None
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_journal_signals.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'journal_signals'`

- [ ] **Step 3: Écrire le module (volet recalls)**

Créer `src/core/journal_signals.py` :

```python
"""Derivations du journal par-game : cout et benefice d'un recall, indices publics
du jungler, contexte allie d'une mort. Module PUR, 0 I/O, 0 appel API.

`game_journal.py` reste l'assembleur : il resout les participants et les frames,
puis appelle ces fonctions. Le decoupage suit la regle du depot (un module par
responsabilite), `game_journal` assemblant deja trois concerns.

ASYMETRIE : tout ce qui sort d'ici est une information que le joueur AVAIT
(son propre CS, ses achats, les objets adverses lisibles au scoreboard, le kill
feed, les annonces d'objectif et de tourelle, la position minimap de son allie).
Aucun `WARD_KILL` adverse, aucune position de frame ennemie, aucun proxy ML_ONLY.
"""
from __future__ import annotations

import statistics

# --- constantes de fenetre ----------------------------------------------------

# Fenetre de mesure du cout en CS d'une visite de shop : de la frame a ou avant la
# visite jusqu'a deux minutes plus tard. Elle inclut donc jusqu'a ~60 s de lane
# AVANT la visite, ce qui DILUE la perte : choix delibere, sous-estimer vaut mieux
# qu'accuser a tort, et demarrer a la frame suivante surestimerait le CS qu'il
# etait mecaniquement impossible de prendre.
CS_WINDOW_MIN = 2
# Plancher de granularite impose par des frames espacees de 60 s. Le chiffre est
# toujours restitue AVEC sa precision, jamais nu.
CS_PRECISION = 2
SPIKE_WINDOW_S = 120          # spike adverse cherche dans [t0 - 120 s, t0 + 120 s]
RECALL_DEATH_WINDOW_S = 90    # mort imputee au retour en lane apres la visite


def _clock(t_ms: int) -> str:
    return f"{t_ms // 60000}:{(t_ms % 60000) // 1000:02d}"


# --- cout en CS ---------------------------------------------------------------

def cs_of_frame(pf: dict) -> int:
    return int(pf.get("minionsKilled") or 0) + int(pf.get("jungleMinionsKilled") or 0)


def cs_baseline(frames_by_min: dict[int, dict],
                skip_minutes: set[int]) -> float | None:
    """Mediane des deltas de CS par minute, minutes contaminees exclues.

    Sans l'exclusion des minutes portant un recall ou une mort, la ligne de base
    integre les pertes qu'on cherche a mesurer et les sous-estime.
    """
    minutes = sorted(frames_by_min)
    deltas = [cs_of_frame(frames_by_min[b]) - cs_of_frame(frames_by_min[a])
              for a, b in zip(minutes, minutes[1:])
              if b - a == 1 and a not in skip_minutes and b not in skip_minutes]
    return float(statistics.median(deltas)) if deltas else None


def recall_cs_cost(my_fr: dict[int, dict], opp_fr: dict[int, dict],
                   t0_ms: int, baseline: float | None) -> dict | None:
    """Cout en CS d'une visite de shop, ou None si la fenetre n'est pas mesurable."""
    if baseline is None:
        return None
    m0 = t0_ms // 60000
    m1 = m0 + CS_WINDOW_MIN
    if not all(m in my_fr for m in (m0, m1)) or not all(m in opp_fr for m in (m0, m1)):
        return None
    mine = cs_of_frame(my_fr[m1]) - cs_of_frame(my_fr[m0])
    theirs = cs_of_frame(opp_fr[m1]) - cs_of_frame(opp_fr[m0])
    expected = round(baseline * CS_WINDOW_MIN, 1)
    return {
        "window": {"from": f"{m0}:00", "to": f"{m1}:00"},
        "my_cs_gained": mine,
        "expected_cs": expected,
        "cs_missed_est": {"value": max(0, round(expected - mine)),
                          "precision_cs": CS_PRECISION},
        "opp_cs_gained": theirs,
        "cs_diff_swing": mine - theirs,
    }


# --- benefice d'une visite ----------------------------------------------------

def classify_visit(item_ids: list[int], catalog: dict) -> dict:
    """Objets finis et gold depense d'une visite. {} sans catalogue (degradation propre)."""
    if not catalog:
        return {}
    known = [(iid, catalog[iid]) for iid in item_ids if iid in catalog]
    finished = [{"id": iid, "name": it["name"], "cost": it["cost"]}
                for iid, it in known if it.get("finished")]
    return {"gold_spent": sum(int(it.get("cost") or 0) for _, it in known),
            "finished_items": finished,
            "is_spike": bool(finished)}


def opponent_spike(opp_visits: list[dict], t0_ms: int, catalog: dict) -> dict | None:
    """Visite de l'adversaire de lane contenant un objet fini dans la fenetre.

    ASYMETRIE : les objets de l'adversaire sont lisibles au scoreboard en jeu.
    """
    if not catalog:
        return None
    window = SPIKE_WINDOW_S * 1000
    for visit in opp_visits:
        t = visit.get("t_ms", 0)
        if abs(t - t0_ms) > window:
            continue
        names = [catalog[i]["name"] for i in visit.get("item_ids", [])
                 if i in catalog and catalog[i].get("finished")]
        if names:
            return {"clock": visit.get("clock") or _clock(t),
                    "delta_s": round((t - t0_ms) / 1000),
                    "items": names}
    return None


def death_after_visit(death_ts: list[int], t0_ms: int) -> dict | None:
    """Premiere mort dans les RECALL_DEATH_WINDOW_S s suivant la visite.

    Le retour en lane n'est pas horodate par la timeline : la fenetre couvre le
    trajet plus les premieres secondes de lane.
    """
    for t in sorted(death_ts):
        if t0_ms <= t <= t0_ms + RECALL_DEATH_WINDOW_S * 1000:
            return {"clock": _clock(t), "delta_s": round((t - t0_ms) / 1000)}
    return None
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_journal_signals.py -v`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/journal_signals.py tests/test_journal_signals.py
git commit -m "feat(journal): cout en CS, objets finis et spike adverse d'une visite de shop"
```

---

### Task 4: `journal_signals` volet morts (jungle + contexte allié)

**Files:**
- Modify: `src/core/journal_signals.py`
- Modify: `tests/test_journal_signals.py`

**Interfaces:**
- Consumes: `turrets.nearest_standing`, `turrets.own_outer` (tâche 1) ; `positioning._depth`.
- Produces:
  - `map_side(x, y) -> "TOP" | "BOT"`
  - `jungle_signals(events, t_ms, jungle_pid, champion, death_pos) -> dict | None`
  - `ally_context(x, y, my_team, my_lane, my_zone, t_ms, support, table, destroyed) -> dict`
  - `PUBLIC_JUNGLE_EVENTS` (documentation de la ligne d'asymétrie)
  - `support` attendu : `{"champion": str, "frames": [(t_ms, (x, y)), ...]}` ou `None`

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_journal_signals.py` :

```python
# --- indices publics du jungler ----------------------------------------------

JPID = 10           # jungler ennemi
DEATH_POS = (13000, 2000)      # botside


def _ev(type_, t_ms, **kw):
    return {"type": type_, "timestamp": t_ms, **kw}


def test_jungle_signals_keeps_the_last_public_clue():
    events = [_ev("CHAMPION_KILL", 300000, killerId=JPID, victimId=2,
                  assistingParticipantIds=[], position={"x": 2000, "y": 13000}),
              _ev("ELITE_MONSTER_KILL", 492000, killerId=JPID,
                  monsterType="DRAGON", position={"x": 9800, "y": 4400})]
    out = S.jungle_signals(events, t_ms=532000, jungle_pid=JPID,
                           champion="Vi", death_pos=DEATH_POS)
    assert out["champion"] == "Vi"
    assert out["age_s"] == 40
    assert out["last"]["type"] == "ELITE_MONSTER_KILL"
    assert out["last"]["clock"] == "8:12"
    assert "age_s" not in out["last"]          # jamais duplique : deux valeurs = confusion


def test_jungle_signals_counts_a_kill_as_assistant():
    events = [_ev("CHAMPION_KILL", 300000, killerId=5, victimId=2,
                  assistingParticipantIds=[JPID], position={"x": 2000, "y": 13000})]
    out = S.jungle_signals(events, 360000, JPID, "Vi", DEATH_POS)
    assert out["last"]["type"] == "CHAMPION_KILL"


def test_jungle_signals_counts_the_death_of_the_jungler():
    """Un jungler mort ne peut pas ganker : c'est l'indice le plus fort, et il est
    public (kill feed)."""
    events = [_ev("CHAMPION_KILL", 300000, killerId=3, victimId=JPID,
                  assistingParticipantIds=[], position={"x": 2000, "y": 13000})]
    out = S.jungle_signals(events, 330000, JPID, "Vi", DEATH_POS)
    assert out["last"]["type"] == "CHAMPION_KILL"
    assert out["age_s"] == 30


def test_jungle_signals_excludes_ward_kills():
    """Un ward casse hors de ma vision n'est PAS une information que j'avais."""
    events = [_ev("WARD_KILL", 300000, killerId=JPID, wardType="YELLOW_TRINKET"),
              _ev("LEVEL_UP", 310000, participantId=JPID),
              _ev("ITEM_PURCHASED", 320000, participantId=JPID, itemId=1001)]
    out = S.jungle_signals(events, 360000, JPID, "Vi", DEATH_POS)
    assert out["last"] is None
    assert out["age_s"] == 360            # depuis le debut de partie


def test_jungle_signals_compares_map_sides():
    events = [_ev("CHAMPION_KILL", 300000, killerId=JPID, victimId=2,
                  assistingParticipantIds=[], position={"x": 2000, "y": 13000})]
    out = S.jungle_signals(events, 360000, JPID, "Vi", DEATH_POS)
    assert out["last"]["same_side_as_death"] is False
    close = S.jungle_signals(
        [_ev("CHAMPION_KILL", 300000, killerId=JPID, victimId=2,
             assistingParticipantIds=[], position={"x": 12000, "y": 3000})],
        360000, JPID, "Vi", DEATH_POS)
    assert close["last"]["same_side_as_death"] is True


def test_jungle_signals_is_none_without_a_resolved_jungler():
    assert S.jungle_signals([], 60000, None, None, DEATH_POS) is None


# --- contexte allie -----------------------------------------------------------

TABLE = [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET",
          "x": 10504, "y": 1029},
         {"team": 100, "lane": "BOT_LANE", "tier": "INNER_TURRET",
          "x": 6919, "y": 1483}]


def _support(frames):
    return {"champion": "Lulu", "frames": frames}


def test_ally_context_reports_an_absent_support():
    support = _support([(240000, (13000, 2000)), (300000, (4000, 10000)),
                        (360000, (4000, 11000))])
    out = S.ally_context(x=13500, y=2500, my_team=100, my_lane="BOT_LANE",
                         my_zone="BOT", t_ms=370000, support=support,
                         table=TABLE, destroyed=set())
    assert out["support"]["champion"] == "Lulu"
    assert out["support"]["zone"] == "JUNGLE/RIVER"
    assert out["support"]["distance"] > 5000
    assert out["support"]["away_from_my_zone_s"] == 130   # depuis 4:00
    assert out["nearest_friendly_turret"]["tier"] == "OUTER_TURRET"
    assert isinstance(out["map_depth"], int)


def test_ally_context_omits_support_when_unresolved():
    out = S.ally_context(13500, 2500, 100, "BOT_LANE", "BOT", 370000,
                         support=None, table=TABLE, destroyed=set())
    assert "support" not in out


def test_beyond_own_outer_turret_is_a_fact_not_an_interpretation():
    deep = S.ally_context(13500, 4200, 100, "BOT_LANE", "BOT", 370000,
                          support=None, table=TABLE, destroyed=set())
    assert deep["beyond_own_outer_turret"] is True
    safe = S.ally_context(8000, 1200, 100, "BOT_LANE", "BOT", 370000,
                          support=None, table=TABLE, destroyed=set())
    assert safe["beyond_own_outer_turret"] is False


def test_ally_context_omits_turret_keys_without_a_table():
    out = S.ally_context(13500, 2500, 100, "BOT_LANE", "BOT", 370000,
                         support=None, table=[], destroyed=set())
    assert "nearest_friendly_turret" not in out
    assert "beyond_own_outer_turret" not in out
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_journal_signals.py -v`
Expected: FAIL avec `AttributeError: module 'journal_signals' has no attribute 'jungle_signals'`

- [ ] **Step 3: Implémenter**

Ajouter à `src/core/journal_signals.py` (imports en tête du fichier) :

```python
from riotlib import approx_zone
from positioning import _depth
import turrets
```

puis, à la suite :

```python
# --- indices publics du jungler ennemi ----------------------------------------

# LA LIGNE D'ASYMETRIE DU BLOC, NON NEGOCIABLE. Sont publics : le kill feed
# (le jungler tueur, assistant, ou VICTIME : un jungler mort ne peut pas ganker,
# c'est l'indice le plus fort), les annonces d'objectif et de tourelle. Sont
# exclus : WARD_KILL (invisible hors vision), LEVEL_UP, ITEM_PURCHASED, et toute
# position de frame du jungler.
PUBLIC_JUNGLE_EVENTS = ("CHAMPION_KILL", "ELITE_MONSTER_KILL",
                        "BUILDING_KILL", "TURRET_PLATE_DESTROYED")


def map_side(x: float, y: float) -> str:
    """Moitie de carte, de part et d'autre de la diagonale mid. `approx_zone` ne
    tranche pas pour JUNGLE/RIVER, or c'est justement la que passe un jungler."""
    return "TOP" if y >= x else "BOT"


def _involves(ev: dict, jungle_pid: int) -> bool:
    if ev["type"] == "CHAMPION_KILL":
        return (ev.get("killerId") == jungle_pid
                or ev.get("victimId") == jungle_pid
                or jungle_pid in (ev.get("assistingParticipantIds") or []))
    return (ev.get("killerId") == jungle_pid
            or jungle_pid in (ev.get("assistingParticipantIds") or []))


def jungle_signals(events, t_ms: int, jungle_pid: int | None,
                   champion: str | None, death_pos: tuple[float, float]) -> dict | None:
    """Dernier indice PUBLIC sur le jungler ennemi avant t_ms.

    Le bloc dit ou le jungler a ete VU, jamais ou il est maintenant : il ne
    modelise ni respawn ni deplacement. `age_s` vit au niveau du bloc uniquement
    (le dupliquer dans `last` exposerait deux valeurs que le LLM croirait
    contradictoires) ; sans indice, il compte depuis le debut de la partie.
    """
    if jungle_pid is None:
        return None
    last = None
    for ev in events:
        if ev.get("timestamp", 0) > t_ms:
            continue
        if ev.get("type") not in PUBLIC_JUNGLE_EVENTS:
            continue
        if not _involves(ev, jungle_pid):
            continue
        if last is None or ev["timestamp"] >= last["timestamp"]:
            last = ev
    out: dict = {"champion": champion}
    if last is None:
        out["age_s"] = round(t_ms / 1000)
        out["last"] = None
        return out
    pos = last.get("position") or {}
    out["age_s"] = round((t_ms - last["timestamp"]) / 1000)
    detail = {"type": last["type"], "clock": _clock(last["timestamp"])}
    if pos.get("x") is not None and pos.get("y") is not None:
        detail["zone"] = approx_zone(pos["x"], pos["y"])
        detail["same_side_as_death"] = (
            map_side(pos["x"], pos["y"]) == map_side(*death_pos))
    out["last"] = detail
    return out


# --- contexte allie -----------------------------------------------------------

def _support_context(x, y, my_zone, t_ms, support) -> dict | None:
    frames = [(t, p) for t, p in (support.get("frames") or []) if t <= t_ms]
    if not frames:
        return None
    frames.sort(key=lambda row: row[0])
    st, (sx, sy) = frames[-1]
    # Depuis quand le support est-il hors de ma zone : on remonte jusqu'a la
    # derniere frame ou il y etait, sinon depuis le debut de la partie.
    last_together = None
    for t, (px, py) in frames:
        if approx_zone(px, py) == my_zone:
            last_together = t
    away = t_ms - (last_together if last_together is not None else 0)
    return {"champion": support.get("champion"),
            "zone": approx_zone(sx, sy),
            "distance": round(((sx - x) ** 2 + (sy - y) ** 2) ** 0.5),
            "away_from_my_zone_s": round(away / 1000)}


def ally_context(x: float, y: float, my_team: int, my_lane: str | None,
                 my_zone: str, t_ms: int, support: dict | None,
                 table: list[dict], destroyed: set) -> dict:
    """Ce que le joueur voyait de son cote : son allie sur la minimap, sa propre
    profondeur, la tourelle amie encore debout la plus proche.

    `map_depth` est DESCRIPTIF, jamais prescriptif : le modele EBM la classe
    « valeur haute vers diamond », une profondeur elevee est donc un marqueur de
    risque et pas un defaut a corriger (regle portee par le prompt).
    """
    out: dict = {"map_depth": round(_depth(x, y, my_team))}
    if support:
        ctx = _support_context(x, y, my_zone, t_ms, support)
        if ctx:
            out["support"] = ctx
    if table:
        near = turrets.nearest_standing(x, y, my_team, destroyed, table=table)
        if near:
            out["nearest_friendly_turret"] = near
        if my_lane:
            outer = turrets.own_outer(my_team, my_lane, destroyed, table=table)
            if outer:
                out["beyond_own_outer_turret"] = (
                    _depth(x, y, my_team) > _depth(outer["x"], outer["y"], my_team))
    return out
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_journal_signals.py -v`
Expected: PASS (23 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/journal_signals.py tests/test_journal_signals.py
git commit -m "feat(journal): indices publics du jungler et contexte allie d'une mort"
```

---

### Task 5: Assemblage dans `game_journal`

**Files:**
- Modify: `src/core/game_journal.py`
- Test: `tests/test_game_journal.py`

**Interfaces:**
- Consumes: tout `journal_signals`, `turrets.load`, `turrets.destroyed_at`.
- Produces: `game_journal(match, timeline, puuid, items=None) -> dict | None`. Chaque mort peut porter `jungle_signals` et `ally_context` ; chaque recall peut porter `cs_cost`, `outcome`, `opponent_spike`, `death_after_visit`.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_game_journal.py` :

```python
CATALOG = {3094: {"name": "Rapid Firecannon", "cost": 2600, "finished": True},
           1038: {"name": "B. F. Sword", "cost": 1300, "finished": False},
           6672: {"name": "Kraken Slayer", "cost": 3100, "finished": True}}


def _cs_pf(gold_total, gold_current, cs, level=5, x=13000, y=2000):
    return {**_pf(gold_total, gold_current, level, x, y),
            "minionsKilled": cs, "jungleMinionsKilled": 0}


def test_journal_is_unchanged_without_a_catalog():
    """Les consommateurs existants (build_sequence_dataset, recalls_for) ne voient
    aucune difference : sans catalogue, les blocs de spike sont simplement absents."""
    tl = _basic_timeline({4: [_buy(240000, 1, 3094)]})
    journal = J.game_journal(_match(), tl, ME)
    recall = journal["recalls"][0]
    assert "outcome" not in recall and "opponent_spike" not in recall


def test_recall_carries_cost_and_outcome_with_a_catalog():
    tl = _basic_timeline({4: [_buy(240000, 1, 3094)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    recall = journal["recalls"][0]
    assert recall["outcome"]["is_spike"] is True
    assert recall["outcome"]["finished_items"][0]["name"] == "Rapid Firecannon"


def test_recall_carries_the_opponent_spike():
    tl = _basic_timeline({4: [_buy(240000, 1, 1038), _buy(250000, 6, 6672)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    spike = journal["recalls"][0]["opponent_spike"]
    assert spike["items"] == ["Kraken Slayer"] and spike["delta_s"] == 10


def test_recall_carries_a_death_that_follows_it():
    tl = _basic_timeline({4: [_buy(240000, 1, 1038)],
                          5: [_kill(290000, victim=1, killer=6)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    assert journal["recalls"][0]["death_after_visit"]["clock"] == "4:50"


def test_death_carries_jungle_signals_and_ally_context():
    tl = _basic_timeline({3: [_dragon_kill(180000)],
                          6: [_kill(360000, victim=1, killer=10)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    death = journal["deaths"][0]
    assert death["is_ganked_by_jungle"] is True
    assert death["jungle_signals"]["champion"] == "LeeSin"
    assert "map_depth" in death["ally_context"]


def test_jungle_signals_never_expose_a_ward_kill():
    ward = {"type": "WARD_KILL", "timestamp": 300000, "killerId": 10,
            "wardType": "YELLOW_TRINKET"}
    tl = _basic_timeline({5: [ward], 6: [_kill(360000, victim=1, killer=10)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    assert journal["deaths"][0]["jungle_signals"]["last"] is None
```

Le `_basic_timeline` existant ne porte pas de CS : étendre `_pf` pour accepter un `cs=0` optionnel plutôt que dupliquer la fixture.

```python
def _pf(gold_total, gold_current, level=5, x=13000, y=2000, cs=0):
    return {"totalGold": gold_total, "currentGold": gold_current,
            "level": level, "position": {"x": x, "y": y},
            "minionsKilled": cs, "jungleMinionsKilled": 0}
```

et dans `_basic_timeline`, donner un CS croissant réaliste :

```python
             {1: _pf(gold_total=500 * minute + 500, gold_current=1234,
                     level=minute + 1, cs=8 * minute),
              6: _pf(gold_total=300 * minute + 500, gold_current=800,
                     level=minute + 1, cs=9 * minute)},
```

Ajouter aussi un test du coût en CS bout en bout :

```python
def test_recall_carries_its_cs_cost():
    tl = _basic_timeline({4: [_buy(240000, 1, 1038)]})
    journal = J.game_journal(_match(), tl, ME, items=CATALOG)
    cost = journal["recalls"][0]["cs_cost"]
    assert cost["window"] == {"from": "4:00", "to": "6:00"}
    assert cost["my_cs_gained"] == 16
    assert cost["cs_missed_est"]["precision_cs"] == 2
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_game_journal.py -v`
Expected: FAIL sur `TypeError: game_journal() got an unexpected keyword argument 'items'`

- [ ] **Step 3: Implémenter l'assemblage**

Dans `src/core/game_journal.py`, ajouter aux imports :

```python
import journal_signals as sig
import turrets
```

Étendre `_GameContext.__init__` (à la suite de `self._opp_fr`) :

```python
        self.support_pid = find_pid(match, team=self.my_team, role="UTILITY")
        if self.support_pid == pid:
            self.support_pid = None
        self.turret_table = turrets.load()
        self.all_events = list(iter_events(timeline))
        self.death_ts = [ev["timestamp"] for ev in self.all_events
                         if ev.get("type") == "CHAMPION_KILL"
                         and ev.get("victimId") == pid]
        # Lane du joueur pour le repere de tourelle exterieure (JUNGLE : aucune).
        self.my_lane = _ROLE_LANE.get(self.my_role)
        self.support = None
        if self.support_pid is not None:
            frames = []
            for fr in timeline["info"]["frames"]:
                pf = fr["participantFrames"].get(str(self.support_pid))
                p = (pf or {}).get("position") or {}
                if p.get("x") is not None and p.get("y") is not None:
                    frames.append((fr["timestamp"], (p["x"], p["y"])))
            self.support = {"champion": self.pid_champ.get(self.support_pid),
                            "frames": frames}
```

et en tête de module :

```python
# Lane portant la tourelle exterieure de reference du joueur. Le jungler n'en a
# pas : la cle `beyond_own_outer_turret` est alors simplement omise.
_ROLE_LANE = {"TOP": "TOP_LANE", "MIDDLE": "MID_LANE",
              "BOTTOM": "BOT_LANE", "UTILITY": "BOT_LANE"}
```

Dans `_deaths`, après le bloc `damage` :

```python
        pos_xy = (pos.get("x", 0), pos.get("y", 0))
        jungle = sig.jungle_signals(ctx.all_events, t, ctx.enemy_jungle_pid,
                                    ctx.pid_champ.get(ctx.enemy_jungle_pid), pos_xy)
        if jungle:
            entry["jungle_signals"] = jungle
        ally = sig.ally_context(
            pos_xy[0], pos_xy[1], ctx.my_team, ctx.my_lane, entry["zone"], t,
            ctx.support, ctx.turret_table,
            turrets.destroyed_at(ctx.all_events, t))
        if ally:
            entry["ally_context"] = ally
```

Ajouter la fonction d'enrichissement des recalls (après `_recalls`) :

```python
def _enrich_recalls(ctx: "_GameContext", recalls: list[dict],
                    items: dict | None) -> list[dict]:
    """Cout et benefice de chaque visite de shop. Les cles vides sont OMISES.

    Le catalogue est injecte plutot qu'importe : `game_journal` ne depend pas de
    Data Dragon, et sans catalogue les blocs de spike sont simplement absents.
    """
    catalog = items or {}
    skip = {t // 60000 for t in ctx.death_ts} | {r["minute"] for r in recalls}
    baseline = sig.cs_baseline(ctx._my_fr, skip)
    opp_visits = (recalls_for(ctx.timeline, ctx.opp_pid, ctx.obj_kills)
                  if (catalog and ctx.opp_pid) else [])
    out = []
    for recall in recalls:
        row = dict(recall)
        t0 = row["t_ms"]
        cost = sig.recall_cs_cost(ctx._my_fr, ctx._opp_fr, t0, baseline)
        if cost:
            row["cs_cost"] = cost
        outcome = sig.classify_visit(row.get("item_ids", []), catalog)
        if outcome:
            row["outcome"] = outcome
        spike = sig.opponent_spike(opp_visits, t0, catalog)
        if spike:
            row["opponent_spike"] = spike
        death = sig.death_after_visit(ctx.death_ts, t0)
        if death:
            row["death_after_visit"] = death
        out.append(row)
    return out
```

`_GameContext` doit garder `self.timeline = timeline` pour que `recalls_for` puisse construire l'index de l'adversaire.

Enfin, la signature publique :

```python
def game_journal(match: dict, timeline: dict, puuid: str,
                 items: dict | None = None) -> dict | None:
    """Une game -> journal d'evenements ancres du joueur. None si hors Faille.

    `items` = catalogue Data Dragon ({id: {name, cost, finished}}), injecte par
    `payload.build_game`. Sans lui, le journal est celui d'avant : les blocs qui
    ont besoin du catalogue sont omis, les consommateurs existants ne changent pas.
    """
```

et dans le retour :

```python
        "recalls": _enrich_recalls(ctx, _recalls(ctx.tl, ctx.pid, ctx.obj_kills,
                                                 ctx.end_ms), items),
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_game_journal.py tests/test_game_journal_consequences.py tests/test_build_sequence_dataset.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/game_journal.py tests/test_game_journal.py
git commit -m "feat(journal): assemble cout de recall, spike adverse, tracking jungle et contexte allie"
```

---

### Task 6: `payload.build_game` transmet le catalogue

**Files:**
- Modify: `src/04_coaching/payload.py:414-419`
- Test: `tests/test_coaching_payload_game.py`

**Interfaces:**
- Consumes: `game_journal(match, timeline, puuid, items=...)`.
- Produces: le payload par-game porte les blocs neufs sous `journal.recalls[*]` et `journal.deaths[*]`.

- [ ] **Step 1: Écrire le test d'échec**

Ajouter à `tests/test_coaching_payload_game.py` :

```python
def test_build_game_passes_the_item_catalog_to_the_journal(monkeypatch):
    """Sans le catalogue, aucun bloc `outcome` ne remonterait : le journal ne peut
    pas savoir seul si un achat est un objet fini."""
    seen = {}

    def _fake_journal(match, timeline, puuid, items=None):
        seen["items"] = items
        return {"match_id": "EUW1_42", "patch": "16.13", "champion": "Zeri",
                "role": "BOTTOM", "win": True, "duration_min": 30.0,
                "kda": {"kills": 1, "deaths": 1, "assists": 1},
                "opponent": "Jinx", "deaths": [], "recalls": []}

    monkeypatch.setattr(PL.gj, "game_journal", _fake_journal)
    monkeypatch.setattr(PL.cprof, "load_items",
                        lambda: {3094: {"name": "RFC", "cost": 2600,
                                        "finished": True}})
    silver, gold = _dirs(tmp_path)
    PL.build_game("spadzze", scope="adc", target="challenger",
                  gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    assert seen["items"][3094]["finished"] is True


def test_build_game_exposes_the_new_recall_blocks(tmp_path, monkeypatch):
    """Bout en bout : le catalogue transmis fait remonter `outcome` au payload."""
    monkeypatch.setattr(PL.cprof, "load_items",
                        lambda: {1055: {"name": "Doran's Blade", "cost": 450,
                                        "finished": False},
                                 3094: {"name": "Rapid Firecannon", "cost": 2600,
                                        "finished": True}})
    silver, gold = _dirs(tmp_path)
    pl = PL.build_game("spadzze", scope="adc", target="challenger",
                       gold_dir=gold, silver_dir=silver, load_raw=_load_raw)
    recall = pl["journal"]["recalls"][0]
    assert recall["outcome"]["is_spike"] is False      # Doran's Blade n'est pas un spike
    assert "cs_cost" in recall
```

La signature du test reste `(tmp_path, monkeypatch)` et réutilise `_dirs` / `_load_raw` déjà définis en tête du fichier.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `poetry run pytest tests/test_coaching_payload_game.py -v`
Expected: FAIL (`seen["items"]` vaut `None`)

- [ ] **Step 3: Implémenter**

Dans `build_game`, déplacer `catalog = cprof.load_items()` AVANT l'appel au journal et le transmettre :

```python
    catalog = cprof.load_items()
    journal = gj.game_journal(match, timeline, rec["puuid"], items=catalog)
```

(supprimer l'affectation `catalog = cprof.load_items()` restée plus bas)

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_coaching_payload_game.py tests/test_payload_parity.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/payload.py tests/test_coaching_payload_game.py
git commit -m "feat(payload): transmet le catalogue d'objets au journal par-game"
```

---

### Task 7: Schéma : catégories fermées, titre, 5 erreurs

**Files:**
- Modify: `src/04_coaching/schema.py`
- Test: `tests/test_coaching_schema.py`

**Interfaces:**
- Produces: `schema.InsightCategory` (Literal fermé de 9 valeurs), `GameInsight.category`, `GameInsight.title` (≤60), `GameInsight.cause` (≤350), `GameInsight.evidence` (≤350), `GameReview.mistakes` 1 à 5, `ChiefSelection.priority_mistake_ids` 1 à 5.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_coaching_schema.py` :

```python
def _insight(**kw):
    base = {"category": "TRACKING_JUNGLE", "title": "Gank bot sans indice jungle",
            "point": "Tu pushes sans info sur le jungler.",
            "cause": "aucun indice public sur Vi depuis 40 s",
            "evidence": "mort a 8:52 en BOT, dernier indice a 8:12"}
    base.update(kw)
    return base


def _review(mistakes):
    return {"strengths": [], "mistakes": mistakes,
            "next_focus": "Reculer sans indice jungle.", "confidence": 0.6}


def test_category_outside_the_closed_list_is_rejected():
    with pytest.raises(ValidationError):
        S.GameInsight.model_validate(_insight(category="VISION"))
    with pytest.raises(ValidationError):
        S.GameInsight.model_validate(_insight(category="INVENTEE"))


def test_all_declared_categories_validate():
    for cat in get_args(S.InsightCategory):
        assert S.GameInsight.model_validate(_insight(category=cat)).category == cat


def test_title_is_capped_at_60_characters():
    S.GameInsight.model_validate(_insight(title="x" * 60))
    with pytest.raises(ValidationError):
        S.GameInsight.model_validate(_insight(title="x" * 61))


def test_cause_and_evidence_are_capped_at_350():
    with pytest.raises(ValidationError):
        S.GameInsight.model_validate(_insight(cause="x" * 400))
    with pytest.raises(ValidationError):
        S.GameInsight.model_validate(_insight(evidence="12:00 " + "x" * 400))


def test_game_review_accepts_five_mistakes_and_rejects_six():
    S.GameReview.model_validate(_review([_insight()] * 5))
    with pytest.raises(ValidationError):
        S.GameReview.model_validate(_review([_insight()] * 6))


def test_chief_selection_follows_the_same_ceiling():
    ids = [f"m{i}" for i in range(6)]
    S.ChiefSelection.model_validate(
        {"summary_insight_id": "m0", "priority_mistake_ids": ids[:5],
         "strength_insight_ids": [], "next_focus_insight_id": "m0",
         "confidence": 0.5})
    with pytest.raises(ValidationError):
        S.ChiefSelection.model_validate(
            {"summary_insight_id": "m0", "priority_mistake_ids": ids,
             "strength_insight_ids": [], "next_focus_insight_id": "m0",
             "confidence": 0.5})


def test_the_closed_list_reaches_the_json_schema_sent_to_ollama():
    """La liste fermee doit etre dans la grammaire, pas seulement dans Pydantic :
    c'est ce qui rend l'invention d'une categorie impossible par construction."""
    sch = json.dumps(S.game_review_json_schema())
    for cat in get_args(S.InsightCategory):
        assert cat in sch
```

(ajouter `import json` et `from typing import get_args` en tête si absents)

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_coaching_schema.py -v`
Expected: FAIL (`category` inconnu, extra ignoré)

- [ ] **Step 3: Implémenter**

Dans `src/04_coaching/schema.py`, avant `GameInsight` :

```python
# Liste FERMEE : elle passe dans le JSON-schema envoye a Ollama, donc inventer une
# categorie est impossible par construction (meme mecanique que l'horodatage
# obligatoire). `VISION` en est volontairement ABSENTE : le journal par-game ne
# porte aucune matiere de vision ancrable (pas de WARD_PLACED du joueur, et les
# proxys ML_ONLY sont exclus par l'asymetrie), une erreur VISION serait donc
# inevitablement non ancree.
InsightCategory = Literal[
    "TRADE_LANE", "WAVE_MANAGEMENT", "TRACKING_JUNGLE",
    "POSITIONNEMENT_COMBAT", "ECONOMIE_RECALL", "BUILD_ACHATS",
    "OBJECTIFS", "EXECUTION_TEAMFIGHT", "GESTION_AVANCE_RETARD"]
```

Dans `GameInsight`, ajouter les champs (la docstring existante reste, complétée d'un paragraphe) :

```python
    category: InsightCategory = Field(description=(
        "Mecanisme en cause, dans la liste fermee : c'est ce qui rend une erreur "
        "comptable d'une partie a l'autre."))
    title: Annotated[str, Field(max_length=60, description=(
        "ETIQUETTE standardisee du mecanisme, lisible d'un coup d'oeil. Jamais "
        "une recopie de `point`, qui porte la lecon complete."))]
    cause: Annotated[str, Field(max_length=350, description=(...))]  # description existante
    evidence: Annotated[str, Field(max_length=350)]
```

Les plafonds de longueur rendent le pavé de 900 caractères **invalide** au lieu de déconseillé ; ils s'appliquent à la validation Pydantic (la grammaire JSON d'Ollama contraint `minItems`/`maxItems`, pas `maxLength`), donc via le retry de `coach._generate`.

Dans `GameReview` : `mistakes: Annotated[list[GameInsight], Field(min_length=1, max_length=5)]`.
Dans `ChiefSelection` : `priority_mistake_ids: Annotated[list[str], Field(min_length=1, max_length=5)]`.

Ajouter aussi un commentaire de compatibilité en tête de `GameReview` :

```python
    # Les reviews deja persistees n'ont ni `category` ni `title`. Elles ne sont
    # jamais revalidees a la lecture (feedback.py et le Worker lisent du JSON
    # brut) : tout consommateur qui les affiche ou les agrege doit tolerer
    # l'absence de ces champs. Exigence testee, pas intention.
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_coaching_schema.py tests/test_coaching_coach.py -v`
Expected: PASS. Les fixtures de `test_coaching_coach.py` qui construisent des `GameInsight` doivent recevoir `category` et `title`.

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/schema.py tests/test_coaching_schema.py tests/test_coaching_coach.py
git commit -m "feat(schema): categories fermees, titre plafonne et jusqu'a 5 erreurs par-game"
```

---

### Task 8: Prompt : recalls jugés, tracking jungle, une idée par erreur

**Files:**
- Modify: `src/04_coaching/prompt.py` (`SYSTEM_GAME`, `SYSTEM_CHIEF`)
- Test: `tests/test_coaching_prompt.py`

**Interfaces:**
- Produces: `GAME_PROMPT_VERSION` et `SPECIALIZED_PROMPT_VERSION` nouvelles (deux cohortes ouvertes).

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_coaching_prompt.py` :

```python
# Empreintes de la cohorte precedente : les deux DOIVENT bouger, sinon les
# reviews neuves seraient melangees aux anciennes dans `by_prompt_version`.
_OLD_GAME_VERSION = "350f7c404b5b"
_OLD_SPECIALIZED_VERSION = "942a61913afa"


def test_both_prompt_versions_moved():
    assert PR.GAME_PROMPT_VERSION != _OLD_GAME_VERSION
    assert PR.SPECIALIZED_PROMPT_VERSION != _OLD_SPECIALIZED_VERSION


def test_recall_rule_judges_cs_cost_and_spike():
    s = PR.SYSTEM_GAME
    assert "cs_missed_est" in s and "precision_cs" in s
    assert "opponent_spike" in s
    assert "is_spike" in s
    assert "3 CS" in s


def test_jungle_rule_forbids_claiming_summoner_availability():
    s = PR.SYSTEM_GAME
    assert "jungle_signals" in s and "ally_context" in s
    low = s.lower()
    assert "summoner" in low and "interdiction" in low
    assert "map_depth" in s


def test_one_idea_per_mistake_rule_is_present():
    s = PR.SYSTEM_GAME
    assert "category" in s and "title" in s
    assert "1 à 5" in s


def test_chief_prompt_follows_the_new_ceiling():
    assert "1 à 5" in PR.SYSTEM_CHIEF
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_coaching_prompt.py -v`
Expected: FAIL sur les empreintes inchangées

- [ ] **Step 3: Implémenter**

Dans `SYSTEM_GAME`, remplacer la fin de la règle 4 par sa version étendue et insérer les deux règles neuves (les numéros des règles 5 à 9 se décalent de deux) :

```
4. RECALLS = COUT ET BENEFICE. [texte existant sur `gold_before`, `next_purchase` \
et `cheapest_item_cost`, inchange] En plus du gold, chaque visite de shop porte \
son COUT et son BENEFICE. Le benefice est `outcome` : `is_spike` vaut vrai quand \
la visite a fini un objet. Une visite SANS objet fini n'est JAMAIS une force : \
c'est le back intermediaire ordinaire. Elle ne devient une erreur \
(`ECONOMIE_RECALL`) que si le journal en mesure le cout : `cs_missed_est.value` \
au-dessus de 3 CS, ou un `opponent_spike` present, ou un `death_after_visit` \
present. Sans aucun de ces trois, ne la mentionne pas. Le cout en CS est une \
ESTIMATION : cite-la toujours avec sa precision (« environ 6 CS, a 2 pres »), \
jamais au CS pres, et appuie-toi en priorite sur `cs_diff_swing`, qui est relatif \
donc robuste. Un `opponent_spike` pendant ta visite est un signal fort : \
l'adversaire est ressorti avec un palier de puissance, toi non. Tu PEUX aussi \
questionner le TIMING d'un achat au regard du champion joue et de la minute \
(un composant defensif tres tardif, un objet de sustain achete apres le premier \
objet legendaire attendu).
5. TRACKING JUNGLE. Pour toute mort `is_ganked_by_jungle`, instruis le MECANISME \
a partir de `jungle_signals` et `ally_context` : l'anciennete du dernier indice \
public (`age_s`), son cote de carte (`same_side_as_death`), l'absence du support \
(`support.away_from_my_zone_s`), le depassement de ta tourelle exterieure \
(`beyond_own_outer_turret`). INTERDICTION ABSOLUE d'affirmer quoi que ce soit sur \
la disponibilite des summoners (flash, heal, barrier) : la donnee n'existe pas \
dans le journal. INTERDICTION d'affirmer ou se trouve le jungler MAINTENANT : le \
journal ne donne que des indices DATES, et `last: null` signifie « aucune \
information », pas « il etait invisible donc il arrivait ». INTERDICTION de \
prescrire a partir de `map_depth`, qui est une observation neutre.
```

et, juste avant la règle de format :

```
8. UNE IDEE PAR ERREUR. Chaque insight porte une `category` de la liste fermee et \
un `title` d'au plus 60 caracteres. `title` est l'ETIQUETTE standardisee du \
mecanisme (elle sert a lire d'un coup d'oeil et a compter les erreurs d'une \
partie a l'autre), `point` est la LECON complete : ne recopie jamais `point` dans \
`title`. Deux mecanismes distincts font DEUX erreurs, pas une longue. Regrouper \
reste autorise quand c'est le MEME mecanisme a plusieurs horodatages.
```

Mettre à jour la règle de format : `"mistakes"` passe à « 1 à 5 objets », et la forme de chaque objet devient `{"category": str, "title": str, "point": str, "cause": str, "evidence": str}`, avec la liste des 9 catégories citée telle quelle.

Dans `SYSTEM_CHIEF`, remplacer « `priority_mistake_ids` (1 à 3 erreurs) » par « `priority_mistake_ids` (1 à 5 erreurs) ».

Vérifier l'absence de tiret cadratin dans les chaînes ajoutées.

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_coaching_prompt.py -v && grep -c '—' src/04_coaching/prompt.py`
Expected: PASS ; le `grep -c` doit rendre le même nombre qu'avant la tâche (`git show HEAD:src/04_coaching/prompt.py | grep -c '—'`), aucun tiret cadratin ajouté.

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/prompt.py tests/test_coaching_prompt.py
git commit -m "feat(prompt): recalls juges au cout, tracking jungle, une idee par erreur"
```

---

### Task 9: Trois tentatives de schéma + mock de démo aligné

**Files:**
- Modify: `src/04_coaching/coach.py:54` (`_generate`)
- Modify: `src/04_coaching/mock_llm.py` (`_game_review`)
- Test: `tests/test_coaching_coach.py`, `tests/test_demo.py`

**Interfaces:**
- Produces: `coach._MAX_SCHEMA_ATTEMPTS = 3` ; le mock émet `category` et `title` et cite un bloc neuf quand il est présent.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_coaching_coach.py` :

```python
def test_generate_retries_the_schema_three_times(monkeypatch):
    """Le surplus de contraintes de cette cohorte (categorie, titre, plafonds)
    merite une tentative de plus : un pave recidiviste coute des tokens, pas la game."""
    calls = {"n": 0}
    good = {"strengths": [], "mistakes": [_GAME_INSIGHT],
            "next_focus": "x", "confidence": 0.5}

    def _gen(model, system, user, schema, temperature=0.2, timeout=180):
        calls["n"] += 1
        data = {"mistakes": []} if calls["n"] < 3 else good
        return llm_client.Generation(data, {"latency_ms": 1, "prompt_tokens": 1,
                                            "completion_tokens": 1})

    monkeypatch.setattr(C.llm_client, "generate", _gen)
    review, run = C._generate("s", "u", {}, C.schema_mod.GameReview, "m", "v")
    assert calls["n"] == 3 and run["schema_retries"] == 2
```

Ajouter à `tests/test_demo.py` :

```python
def test_mock_emits_category_and_title():
    import mock_llm
    payload = {"journal": {"deaths": [{"clock": "8:52", "zone": "BOT",
                                       "unspent_gold": 900, "is_solo": True,
                                       "killer_champ": "Vi", "phase": "mid"}],
                           "recalls": [{"clock": "4:00", "gold_before": 1200,
                                        "cs_cost": {"cs_missed_est": {"value": 6,
                                                     "precision_cs": 2}}}]}}
    review = mock_llm._game_review(payload)
    for item in review["mistakes"] + review["strengths"]:
        assert item["category"] and item["title"]
        assert len(item["title"]) <= 60
    # le mock ne cite que du materiel reellement present dans le payload
    assert "6" in review["strengths"][0]["evidence"] or "1200" in \
        review["strengths"][0]["evidence"]
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_coaching_coach.py tests/test_demo.py -v`
Expected: FAIL (2 tentatives seulement ; pas de `category` au mock)

- [ ] **Step 3: Implémenter**

Dans `coach.py`, en tête :

```python
# 1 essai + 2 retries. La cohorte « erreurs categorisees » ajoute categorie, titre
# et plafonds de longueur : c'est la validation Pydantic (et non la grammaire
# d'Ollama) qui les fait respecter, donc une tentative de plus absorbe le pave
# recidiviste. Les tentatives rejetees restent comptees dans `schema_retries` et
# leurs tokens cumules.
_MAX_SCHEMA_ATTEMPTS = 3
```

et remplacer `for attempt in range(2):` par `for attempt in range(_MAX_SCHEMA_ATTEMPTS):`.

Dans `mock_llm._game_review`, donner à chaque insight sa `category` et son `title`, et citer le bloc `cs_cost` quand il est présent (le mock doit rester un lecteur du payload, jamais un inventeur) :

```python
    if worst:
        mistakes.append({
            "category": "POSITIONNEMENT_COMBAT",
            "title": f"Mort en {worst.get('zone', '?')} avec de l'or en poche"[:60],
            ... # champs existants
        })
```

et pour la force sur le recall :

```python
    if recalls:
        r = recalls[0]
        missed = ((r.get("cs_cost") or {}).get("cs_missed_est") or {}).get("value")
        evidence = f"recall à {r.get('clock', '0:00')} avec {_fmt_gold(r.get('gold_before'))}"
        if isinstance(missed, (int, float)):
            evidence += f", environ {int(missed)} CS manqués"
        strengths.append({
            "category": "ECONOMIE_RECALL",
            "title": "Reset avec de quoi acheter"[:60],
            "point": "Tu repasses à la base avec de quoi acheter.",
            "cause": "recall déclenché sur un seuil d'or, pas sur une mort",
            "evidence": evidence,
        })
```

Le troisième gabarit (journal sans mort) reçoit `"category": "GESTION_AVANCE_RETARD"` et un titre court ; celui de la première mort, `"category": "POSITIONNEMENT_COMBAT"`.

- [ ] **Step 4: Lancer les tests et la démo jusqu'au vert**

Run: `poetry run pytest tests/test_coaching_coach.py tests/test_demo.py -v && make demo`
Expected: PASS, et `make demo` va jusqu'au rapport d'ancrage.

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/coach.py src/04_coaching/mock_llm.py tests/test_coaching_coach.py tests/test_demo.py
git commit -m "feat(coach): 3 tentatives de schema, mock de demo categorise"
```

---

### Task 10: `grounding` indexe les blocs neufs

**Files:**
- Modify: `src/04_coaching/grounding.py` (`_collect_clocks`, `asymmetry_violations`/`_texts`)
- Test: `tests/test_grounding.py`

**Interfaces:**
- Produces: `payload_clocks` collecte aussi les clés `from`/`to` au motif `mm:ss` ; `asymmetry_violations` examine aussi `title`.

**Contexte:** ne PAS toucher au cloisonnement par unité. Les unités `cs` et `u` existent déjà dans `UNITS`, et les blocs neufs héritent de la bonne unité par leur nom de clé (`cs_cost` transmet `cs`, `distance` transmet `u`). Deux chantiers seulement, ceux listés ci-dessous. Enrichir le payload sans mettre à jour `grounding.py` a déjà fait chuter le taux d'ancrage deux fois (bloc `damage`) : ce sont ces deux points qui manquent, et rien d'autre.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_grounding.py` :

```python
def test_window_clocks_are_collected():
    payload = {"journal": {"recalls": [
        {"clock": "7:38", "cs_cost": {"window": {"from": "7:00", "to": "9:00"},
                                      "my_cs_gained": 11}}]}}
    clocks = G.payload_clocks(payload)
    assert {"7:38", "7:00", "9:00"} <= clocks


def test_a_stray_from_key_is_not_taken_for_a_clock():
    payload = {"meta": {"from": "referentiel challenger"}}
    assert G.payload_clocks(payload) == set()


def test_a_distance_does_not_ground_a_gold_amount():
    """Cloisonnement par unite : 2 850 unites de distance ne doit pas ancrer
    « 2 850 g » invente."""
    payload = {"journal": {"deaths": [
        {"clock": "8:52", "ally_context": {
            "nearest_friendly_turret": {"lane": "BOT_LANE",
                                        "tier": "OUTER_TURRET",
                                        "distance": 2850}}}]}}
    index = G.payload_index(payload)
    assert G.classify_number(2850, index, "u") == "exact"
    assert G.classify_number(2850, index, "g") == "non_ancre"


def test_cs_cost_values_are_grounded_as_cs():
    payload = {"journal": {"recalls": [
        {"clock": "7:38", "cs_cost": {"my_cs_gained": 11, "expected_cs": 16.8,
                                      "cs_missed_est": {"value": 6,
                                                        "precision_cs": 2}}}]}}
    index = G.payload_index(payload)
    assert G.classify_number(6, index, "cs") == "exact"
    assert G.classify_number(17, index, "cs") == "arrondi"     # 16,8 cite arrondi


def test_new_block_clocks_are_recognised():
    payload = {"journal": {"deaths": [
        {"clock": "8:52", "jungle_signals": {"champion": "Vi", "age_s": 40,
                                             "last": {"type": "CHAMPION_KILL",
                                                      "clock": "8:12"}}}],
        "recalls": [{"clock": "7:38",
                     "opponent_spike": {"clock": "7:52", "delta_s": 14},
                     "death_after_visit": {"clock": "8:31", "delta_s": 53}}]}}
    clocks = G.payload_clocks(payload)
    assert {"8:12", "7:52", "8:31"} <= clocks


def test_a_descriptive_title_is_flagged_as_an_asymmetry_violation():
    review = {"mistakes": [{"category": "POSITIONNEMENT_COMBAT",
                            "title": "Surextension a repetition",
                            "point": "Recule d'un cran en side lane.",
                            "cause": "tu avances sans allie proche",
                            "evidence": "mort a 12:03 en BOT"}]}
    assert G.asymmetry_violations(review)
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_grounding.py -v`
Expected: FAIL sur les horloges de fenêtre et sur le `title`

- [ ] **Step 3: Implémenter**

Dans `grounding.py`, au-dessus de `_collect_clocks` :

```python
# Cles portant une horloge. `clock` est la convention du journal ; `from`/`to`
# bornent la fenetre de `cs_cost`, et le motif mm:ss sert de garde-fou pour ne
# pas ramasser un `from`/`to` etranger aux horloges.
_CLOCK_KEYS = ("clock", "from", "to")
_EXACT_CLOCK_RE = re.compile(r"^\d{1,2}:[0-5]\d$")
```

et remplacer le corps dict de `_collect_clocks` :

```python
    if isinstance(node, dict):
        for name in _CLOCK_KEYS:
            value = node.get(name)
            if isinstance(value, str) and _EXACT_CLOCK_RE.match(value):
                out.add(value)
        for child_key, child in node.items():
            _collect_clocks(child, child_key, out)
```

Dans `_texts` (celui utilisé par `asymmetry_violations`), ajouter `title` aux clés examinées :

```python
        return [v for k, v in node.items()
                if isinstance(v, str) and k in ("title", "point", "cause", "evidence")]
```

Le `title` est une étiquette prescriptive au même titre que `point` : un titre « surextension à répétition » échapperait sinon au contrôle descriptif.

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_grounding.py -v`
Expected: PASS. Le contrôle négatif calibré (`ROUNDED_REL`) doit rester au même niveau qu'avant : si son test bouge, c'est un vrai signal, à rapporter.

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/grounding.py tests/test_grounding.py
git commit -m "feat(grounding): horloges de fenetre et titre soumis au controle d'ancrage"
```

---

### Task 11: `by_category` dans les deux runtimes

**Files:**
- Modify: `src/04_coaching/feedback.py` (`eval_report`, + helper `by_category`)
- Modify: `web/cf/src/evaluation.ts`
- Test: `tests/test_coaching_feedback.py`, `tests/test_eval_parity.py`

**Interfaces:**
- Produces: `eval_report(...)["by_category"] = {categorie: {"n": int, "useful": int, "rate": float | None}}`, seau `"none"` pour les items sans catégorie. Même forme dans `EvalReport.by_category` côté TypeScript.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_coaching_feedback.py` :

```python
def _write(root, reviews, feedbacks):
    (root / "p").mkdir(parents=True, exist_ok=True)
    (root / "p" / "reviews.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in reviews))
    (root / "p" / "feedback.jsonl").write_text(
        "".join(json.dumps(f, ensure_ascii=False) + "\n" for f in feedbacks))


def test_by_category_exposes_a_sample_size_per_bucket(tmp_path):
    """A 10-27 annotations sur 9 categories, un taux sans effectif est du bruit."""
    root = tmp_path / "07_coaching"
    review = {"ts": "t1", "kind": "game", "match_id": "EUW1_1", "model": "kimi-k2.6",
              "run": {"prompt_version": "v2"},
              "review": {"strengths": [],
                         "mistakes": [
                             {"category": "TRACKING_JUNGLE", "title": "a",
                              "point": "p", "cause": "c", "evidence": "8:12"},
                             {"category": "ECONOMIE_RECALL", "title": "b",
                              "point": "p", "cause": "c", "evidence": "7:38"}]}}
    fb = {"ts": "t1", "player": "p", "model": "kimi-k2.6",
          "rated_at": "2026-09-06T12:00:00",
          "items": [{"kind": "mistake", "index": 0, "useful": True},
                    {"kind": "mistake", "index": 1, "useful": False,
                     "tag": "trop-vague"}]}
    _write(root, [review], [fb])
    cats = FB.eval_report("p", root=root)["by_category"]
    assert cats["TRACKING_JUNGLE"] == {"n": 1, "useful": 1, "rate": 1.0}
    assert cats["ECONOMIE_RECALL"] == {"n": 1, "useful": 0, "rate": 0.0}


def test_items_of_an_uncategorised_review_fall_into_none(tmp_path):
    """Les 27 reviews deja persistees n'ont pas de categorie : elles restent
    identifiables au lieu d'etre diluees."""
    root = tmp_path / "07_coaching"
    review = {"ts": "t1", "kind": "game", "match_id": "EUW1_1", "model": "kimi-k2.6",
              "review": {"strengths": [],
                         "mistakes": [{"point": "p", "cause": "c",
                                       "evidence": "8:12"}]}}
    fb = {"ts": "t1", "player": "p", "model": "kimi-k2.6",
          "rated_at": "2026-09-06T12:00:00",
          "items": [{"kind": "mistake", "index": 0, "useful": True}]}
    _write(root, [review], [fb])
    assert FB.eval_report("p", root=root)["by_category"]["none"]["n"] == 1
```

Ajouter à `tests/test_eval_parity.py` :

```python
_CATEGORY_KEYS = {"n", "useful", "rate"}


def test_by_category_nested_keys_match(tmp_path):
    ts = EVAL_TS.read_text()
    assert re.search(r"\bby_category\b", ts)
    for key in _CATEGORY_KEYS:
        assert re.search(rf"\b{key}\b", ts), key
    report = fb.eval_report("nobody", root=ROOT / "tests" / "nonexistent")
    assert "by_category" in report
```

et compléter la liste de champs de `test_both_report_the_same_shape` avec `"by_category"`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_coaching_feedback.py tests/test_eval_parity.py -v`
Expected: FAIL avec `KeyError: 'by_category'`

- [ ] **Step 3: Implémenter côté Python**

Dans `feedback.py`, à côté de `objective_stats` :

```python
_KIND_SECTION = {"strength": "strengths", "mistake": "mistakes"}
NO_CATEGORY = "none"


def by_category(fbs: list[schema_mod.Feedback], reviews: list[dict]) -> dict:
    """Taux d'utilite ventile par categorie d'insight.

    Jointure (ts de review, kind, index) -> categorie de l'insight correspondant.
    Les items des reviews d'avant la cohorte categorisee tombent dans le seau
    `none`. CHAQUE seau expose son effectif `n` : sur 9 categories et quelques
    dizaines d'annotations, la plupart seront vides ou presque, et un taux sans
    effectif est du bruit.
    """
    index = {r.get("ts"): (r.get("review") or {}) for r in reviews}
    out: dict[str, dict] = {}
    for fb in fbs:
        review = index.get(fb.ts) or {}
        for item in fb.items:
            section = review.get(_KIND_SECTION.get(item.kind) or "") or []
            insight = (section[item.index]
                       if isinstance(section, list) and item.index < len(section)
                       else {})
            cat = (insight.get("category") if isinstance(insight, dict) else None) \
                or NO_CATEGORY
            bucket = out.setdefault(cat, {"n": 0, "useful": 0, "rate": None})
            bucket["n"] += 1
            bucket["useful"] += 1 if item.useful else 0
    for bucket in out.values():
        bucket["rate"] = bucket["useful"] / bucket["n"] if bucket["n"] else None
    return dict(sorted(out.items()))
```

et dans `eval_report`, ajouter `"by_category": by_category(fbs, reviews),` au dictionnaire retourné. Ajouter la ventilation à `render_summary` (une ligne par seau non vide, `catégorie  taux  (useful/n)`).

- [ ] **Step 4: Implémenter côté TypeScript**

Dans `web/cf/src/evaluation.ts` : étendre `ReviewRow` d'un champ `review?: { strengths?: {category?: string}[]; mistakes?: {category?: string}[] }`, ajouter à l'interface

```ts
  by_category: Record<string, { n: number; useful: number; rate: number | null }>;
```

et calculer, à partir des feedbacks et des reviews indexées par `ts`, la même ventilation (item.index dans `strengths`/`mistakes` selon `item.kind`, seau `"none"` sinon). `FeedbackItem` doit gagner `index?: number`.

- [ ] **Step 5: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_coaching_feedback.py tests/test_eval_parity.py -v`
Expected: PASS

- [ ] **Step 6: Vérifier le typage du Worker**

Run: `cd web/cf && npx tsc --noEmit` (ou le script de vérification déclaré dans `web/cf/package.json`)
Expected: 0 erreur

- [ ] **Step 7: Commit**

```bash
git add src/04_coaching/feedback.py web/cf/src/evaluation.ts tests/test_coaching_feedback.py tests/test_eval_parity.py
git commit -m "feat(eval): taux d'utilite par categorie, avec effectif, dans les deux runtimes"
```

---

### Task 12: Perturbation contrefactuelle `no_opponent_spike`

**Files:**
- Modify: `src/04_coaching/counterfactual.py`
- Test: `tests/test_counterfactual.py`

**Interfaces:**
- Produces: `perturb_no_opponent_spike`, `check_no_opponent_spike`, entrée `"no_opponent_spike"` dans `PERTURBATIONS`.

- [ ] **Step 1: Écrire les tests d'échec**

Ajouter à `tests/test_counterfactual.py` :

```python
def test_perturb_no_opponent_spike_removes_the_block():
    payload = {"journal": {"deaths": [], "recalls": [
        {"clock": "7:38", "opponent_spike": {"clock": "7:52", "delta_s": 14,
                                             "items": ["Kraken Slayer"]}},
        {"clock": "12:10"}]}}
    out = CF.perturb_no_opponent_spike(payload)
    assert all("opponent_spike" not in r for r in out["journal"]["recalls"])
    assert "opponent_spike" in payload["journal"]["recalls"][0]   # pur


def test_check_no_opponent_spike_fails_when_the_spike_is_still_cited():
    payload = {"journal": {"recalls": [
        {"clock": "7:38", "opponent_spike": {"clock": "7:52", "delta_s": 14,
                                             "items": ["Kraken Slayer"]}}]}}
    still = {"strengths": [], "mistakes": [
        {"category": "ECONOMIE_RECALL", "title": "t", "point": "p",
         "cause": "Jinx finit Kraken Slayer pendant ton back",
         "evidence": "recall a 7:38"}], "next_focus": "x", "confidence": 0.5}
    clean = {"strengths": [], "mistakes": [
        {"category": "ECONOMIE_RECALL", "title": "t", "point": "p",
         "cause": "tu rentres sans objet fini", "evidence": "recall a 7:38"}],
        "next_focus": "x", "confidence": 0.5}
    assert CF.check_no_opponent_spike({}, still, payload)["passed"] is False
    assert CF.check_no_opponent_spike({}, clean, payload)["passed"] is True


def test_no_opponent_spike_is_registered():
    assert "no_opponent_spike" in CF.PERTURBATIONS
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `poetry run pytest tests/test_counterfactual.py -v`
Expected: FAIL avec `AttributeError: perturb_no_opponent_spike`

- [ ] **Step 3: Implémenter**

```python
def perturb_no_opponent_spike(payload: dict) -> dict:
    """Retire les blocs `opponent_spike` des recalls.

    Sans cette perturbation, les blocs neufs de la cohorte passeraient l'eval
    sans jamais etre testes en sensibilite : on saurait que le coach les cite,
    pas qu'il les LIT.
    """
    out = copy.deepcopy(payload)
    for recall in (out.get("journal") or {}).get("recalls") or []:
        recall.pop("opponent_spike", None)
    return out


def spiked_item_names(payload: dict) -> set[str]:
    return {name
            for recall in (payload.get("journal") or {}).get("recalls") or []
            for name in ((recall.get("opponent_spike") or {}).get("items") or [])}


def check_no_opponent_spike(base: dict, new: dict, payload: dict) -> dict:
    """`payload` est le payload D'ORIGINE : ses noms d'objets de spike sont la cible."""
    names = spiked_item_names(payload)
    joined = " ".join(_texts(new)).lower()
    recited = sorted(n for n in names if n.lower() in joined)
    return {"expected": "aucun objet de spike adverse encore cite",
            "observed": f"objets d'origine {sorted(names) or '∅'} ; "
                        f"encore cites apres {recited or '∅'}",
            "passed": not recited}
```

et enregistrer :

```python
    "no_opponent_spike": (perturb_no_opponent_spike, check_no_opponent_spike,
                          "spike adverse retire des recalls"),
```

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run: `poetry run pytest tests/test_counterfactual.py -v`
Expected: PASS. NE PAS lancer `counterfactual.py` contre le vrai modèle dans cette tâche (chaque perturbation coûte un appel Ollama de plusieurs minutes) : c'est l'objet de la tâche 14.

- [ ] **Step 5: Commit**

```bash
git add src/04_coaching/counterfactual.py tests/test_counterfactual.py
git commit -m "feat(eval): perturbation contrefactuelle sur le spike adverse"
```

---

### Task 13: Frontend : pastille de catégorie et titre

**Files:**
- Modify: `web/frontend/index.html` (blocs d'insight par-game, lignes ~977 et ~1005 ; blocs agrégés ~722 et ~747)
- Modify: `web/frontend/app.js` (`insightTitle`)
- Modify: `web/frontend/style.css` (classe `.insight-category`)

**Interfaces:**
- Consumes: `review.mistakes[*].category` et `.title`, tous deux absents des anciennes reviews.
- Produces: rien de programmatique.

- [ ] **Step 1: Repli propre dans `app.js`**

Ajouter à côté de `insightTitle` :

```js
    // Les reviews d'avant la cohorte categorisee n'ont ni `title` ni `category` :
    // on retombe sur le titre derive de `point`, exactement comme avant.
    displayTitle(item) {
      if (item && item.title) return String(item.title);
      return this.insightTitle(item?.point);
    },

    categoryLabel(item) {
      const raw = item && item.category;
      if (!raw) return "";
      return String(raw).replaceAll("_", " ").toLowerCase();
    },
```

- [ ] **Step 2: Brancher les gabarits**

Dans les quatre blocs d'insight (forces et erreurs, vue agrégée et vue par-game), remplacer

```html
<h4 class="insight-title" x-text="insightTitle(item.point)"></h4>
```

par

```html
<div class="insight-head">
  <span class="insight-category" x-show="categoryLabel(item)" x-text="categoryLabel(item)"></span>
  <h4 class="insight-title" x-text="displayTitle(item)"></h4>
</div>
<p class="insight-body" x-show="insightBody(item.point)" x-text="insightBody(item.point)"></p>
```

en respectant le nom de variable de chaque `x-for` (`it` dans la vue agrégée, `item` dans la vue par-game). La ligne `insight-body` existante reste, telle quelle.

- [ ] **Step 3: Styler la pastille**

Dans `style.css`, à côté des styles d'insight existants :

```css
.insight-head { display: flex; align-items: baseline; gap: .5rem; flex-wrap: wrap; }
.insight-category {
  font-size: .68rem; letter-spacing: .04em; text-transform: uppercase;
  padding: .1rem .45rem; border-radius: 999px;
  background: var(--chip-bg, rgba(255,255,255,.08)); color: var(--muted, #9aa4b2);
  white-space: nowrap;
}
```

(reprendre les variables de couleur réellement définies dans la feuille plutôt que d'en inventer)

- [ ] **Step 4: Vérifier à l'oeil**

Run: `poetry run python3 -m http.server 8765 --directory web/frontend` puis ouvrir `http://localhost:8765` (ou le script de dev déjà utilisé pour le frontend).
Expected: une review sans catégorie s'affiche exactement comme avant ; une review avec catégorie affiche la pastille avant le titre.

- [ ] **Step 5: Commit**

```bash
git add web/frontend/index.html web/frontend/app.js web/frontend/style.css
git commit -m "feat(web): pastille de categorie et titre d'insight, repli sur les anciennes reviews"
```

---

### Task 14: Validation bout en bout et documentation

**Files:**
- Modify: `CLAUDE.md` (arborescence `src/core/`, `src/pipeline_ops/`, modules `core/`, section `04_coaching/`, `data/00_static/`)
- Modify: `docs/MODEL_CARD.md` (si la section coaching y décrit le schéma de sortie)
- Modify: `todo.md` (Priorité 0)

**Interfaces:** aucune.

- [ ] **Step 1: Suite complète et démo**

Run: `poetry run pytest tests/ -q && make demo`
Expected: tout vert. Rapporter tout échec plutôt que de le contourner.

- [ ] **Step 2: Générer une review réelle sur la nouvelle cohorte**

Run: `poetry run python3 src/04_coaching/coach.py --player spadzze --scope adc --game latest`
Expected: une `GameReview` valide, avec `category` et `title` sur chaque insight, au moins une erreur découpée là où l'ancienne cohorte faisait un pavé, et un bloc `run.prompt_version` différent de `350f7c404b5b`. Coller la sortie dans le rapport de tâche.

- [ ] **Step 3: Mesurer l'ancrage de la review neuve**

Run: `poetry run python3 src/04_coaching/grounding.py --player spadzze --kind game --details`
Expected: le taux d'ancrage de la nouvelle review est au niveau de la cohorte précédente (≈0.9) ou au-dessus. Une chute franche signale un bloc non indexé : à rapporter, pas à masquer.

- [ ] **Step 4: Une perturbation contrefactuelle réelle**

Run: `poetry run python3 src/04_coaching/counterfactual.py --player spadzze --n 1 --perturbation no_opponent_spike`
Expected: la sortie va dans `data/07_coaching/spadzze/eval/`, jamais dans `reviews.jsonl`. Chaque appel prend plusieurs minutes : n'en lancer qu'un.

- [ ] **Step 5: Mettre à jour la documentation**

Dans `CLAUDE.md` :
- arborescence : ajouter `journal_signals.py` et `turrets.py` à `src/core/`, `build_turret_map.py` à `src/pipeline_ops/`, et `sr_turrets.json` à `data/00_static/` (force-add, comme `champion_traits.json`) ;
- section « Modules `core/` » : une entrée `journal_signals.py` (les cinq dérivations, la ligne d'asymétrie du bloc jungle, la précision de ±2 CS) et une entrée `turrets.py` (table dérivée du raw, proximité sur tourelles debout uniquement) ;
- entrée `game_journal.py` : le paramètre `items` et les blocs neufs ;
- section `04_coaching/` : les 9 catégories fermées, `title`, `mistakes` 1 à 5, les 3 tentatives de schéma, `by_category` dans `eval_report` et `evaluation.ts`, la perturbation `no_opponent_spike` ;
- avertissement `data/` : mentionner le second fichier force-add.

Dans `todo.md`, marquer l'incrément et noter la conséquence assumée : la comparaison de cohortes devient **indicative** (le dénominateur du taux d'utilité passe de 3 à 5 erreurs) et les 10 reviews en attente ne seront pas annotées une par une, leur feedback ayant déjà produit cette spec.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md todo.md docs/MODEL_CARD.md
git commit -m "docs: journal enrichi, categories d'erreurs et eval par categorie"
```

---

## Notes d'exécution

- **Ne pas pousser vers Cloudflare** (`sync_cloudflare.py --push-coaching`, déploiement du Worker) : effet de bord hors dépôt, à faire valider par Jean séparément.
- **Ne pas annoter les 10 reviews en attente** : §12 de la spec les écarte explicitement.
- La table `sr_turrets.json` est figée par patch. Un remaniement de la carte fera échouer `build_turret_map.py` : c'est le comportement voulu, pas un bug à contourner.
