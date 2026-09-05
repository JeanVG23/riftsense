# Coaching par-game : jugement des recalls, tracking jungle, erreurs catégorisées

**Date** : 2026-09-05
**Statut** : design validé, plan à écrire
**Origine** : feedback de Jean après lecture des 10 reviews de la cohorte
`350f7c404b5b` (Priorité 0 de `todo.md`).

## 1. Le problème

Quatre défauts relevés à la lecture des reviews par-game.

1. **Le recall n'est jugé que par le gold.** Le coach félicite « bon recall, tu
   dépenses bien ton gold » sans regarder ce que le recall a coûté en CS ni ce
   qu'il a rapporté. Un back Cull + Pickaxe + Noonquiver ne donne aucun spike :
   c'est le back intermédiaire ordinaire, pas un point fort. Et si l'adversaire
   termine un objet pendant ce back, c'est un mauvais back.
2. **Le jungle tracking n'est jamais évoqué**, alors que les morts par le
   jungleur adverse viennent le plus souvent d'un mauvais wave management,
   d'une prise de risque sans summoners, ou d'un tracking défaillant.
3. **Les erreurs sont des pavés.** Une seule erreur empile positionnement,
   matchup, conséquences et benchmark sur 900 caractères, parce que le schéma
   plafonne à 3 erreurs : le modèle entasse au lieu de découper.
4. **Rien ne permet la lecture d'un coup d'œil** ni le comptage d'un type
   d'erreur d'une partie à l'autre.

## 2. Objectifs et non-objectifs

**Objectifs.** Donner au coach la matière déterministe pour juger un recall
(coût en CS, bénéfice en objets finis, spike adverse), pour instruire une mort
par gank (indices publics du jungler, position du support, distance à la
tourelle amie debout), et pour rendre ses erreurs découpées, titrées et
comptables entre parties.

**Non-objectifs, assumés.**

- **La disponibilité des summoners.** La timeline ne date aucun cast de
  summoner spell : `summoner1Casts` est un total de fin de partie. Le coach
  aura l'interdiction explicite d'affirmer « tu as pris ce risque sans flash ».
  Renvoyé à la Live Client Data API, phase 2.
- **Le benchmark de build par champion** (« un Cull à cette minute est-il
  tardif pour Zeri ? »). Le coach mobilisera sa connaissance générale des
  champions, autorisée par la règle matchup existante, sans table de référence.
  Un benchmark de timings d'objets par champion est un chantier à part.
- **La précision au minion près.** Les frames sont espacées de 60 s. Voir §5.

## 3. Contraintes globales

Ces contraintes lient chaque tâche du plan qui suivra.

- **Asymétrie.** Tout champ ajouté au journal doit être une information que le
  joueur AVAIT. Concrètement : le kill feed, les annonces d'objectif et de
  tourelle, le scoreboard (items adverses), sa propre position, celle de son
  allié affichée sur la minimap. Interdits : les `WARD_KILL` adverses, toute
  position ennemie hors événement public, tout proxy `ML_ONLY` de
  `positioning.py`.
- **0 appel à l'API Riot.** Tout se dérive du raw déjà caché.
- **Français, tutoiement.** Jamais de tiret cadratin, ni dans le code, ni dans
  les commentaires, ni dans les chaînes de prompt.
- **Lancer depuis la racine** avec `poetry run`. Convention d'import plat :
  chaque script insère `src/core/` dans `sys.path`.
- **`data/` n'est jamais commité**, sauf les deux fichiers de configuration
  source explicitement force-add (`champion_traits.json`, et désormais
  `sr_turrets.json`).
- **TDD.** Chaque dérivation nouvelle a son test avant son implémentation.
- **`poetry run pytest tests/`** doit rester vert, `make demo` aussi.

## 4. Architecture

Un module pur nouveau porte les dérivations ; `game_journal.py` reste
l'assembleur.

```
src/core/journal_signals.py   NOUVEAU, pur, 0 I/O
    recall_cs_cost()          cout en CS d'une visite de shop
    classify_visit()          objets finis / spike d'une visite
    opponent_spike()          spike adverse dans la fenetre
    jungle_signals()          dernier indice public du jungler ennemi
    ally_context()            support, profondeur, tourelle amie debout

src/core/turrets.py           NOUVEAU, pur : charge sr_turrets.json,
                              nearest_standing(), destroyed_at()

src/core/game_journal.py      assemble : 4 appels de plus, aucune logique neuve
src/core/champion_profiles.py load_items() gagne `finished: bool`
src/pipeline_ops/build_turret_map.py  NOUVEAU, one-shot, 0 API
data/00_static/sr_turrets.json        NOUVEAU, force-add
```

`game_journal.py` fait déjà 417 lignes et assemble trois concerns. Y ajouter
cinq dérivations le rendrait illisible. Le découpage suit la règle du dépôt :
un module par responsabilité, pas par couche.

### Injection du catalogue d'objets

La classification « objet fini » a besoin du catalogue Data Dragon, que
`game_journal` n'importe pas. On l'injecte plutôt que de créer une dépendance :

```python
def game_journal(match: dict, timeline: dict, puuid: str,
                 items: dict | None = None) -> dict | None:
```

Sans catalogue, les champs de spike sont simplement absents. Les consommateurs
existants (`build_sequence_dataset.py`, `recalls_for`) ne voient aucune
différence. `payload.build_game` appelle déjà `cprof.load_items()` et
transmettra le catalogue.

## 5. La table des tourelles

Riot ne publie pas les coordonnées des tourelles, mais chaque événement
`BUILDING_KILL` porte sa `position`. Un balayage du raw suffit à reconstituer
la table exacte, sans rien écrire de mémoire. Vérifié sur 40 timelines : une
position distincte par clé `(teamId, laneType, towerType)`, et deux pour
`NEXUS_TURRET`, ce qui est correct.

```
(100, 'BOT_LANE', 'OUTER_TURRET')  -> (10504, 1029)
(200, 'BOT_LANE', 'OUTER_TURRET')  -> (13866, 4505)
(100, 'MID_LANE', 'NEXUS_TURRET')  -> (1748, 2270) et (2177, 1807)
```

**`src/pipeline_ops/build_turret_map.py`** : balaye N timelines du raw
(`--limit`, défaut 200), agrège les positions par clé, et écrit
`data/00_static/sr_turrets.json`. Il **échoue** si une clé présente plus d'une
position pour une tourelle simple ou plus de deux pour une tourelle de nexus :
cela signalerait un changement de carte, pas un fichier à écraser en silence.
Idempotent, `--dry-run`. Le fichier est force-add au dépôt comme
`champion_traits.json` : c'est une configuration source dérivée, pas une donnée.

**`src/core/turrets.py`** expose :

```python
def load(static_dir=None) -> list[dict]
    # [{"team": 100, "lane": "BOT_LANE", "tier": "OUTER_TURRET", "x": .., "y": ..}]

def destroyed_at(timeline_events, t_ms: int) -> set[tuple[int, str, str]]
    # cles (team, lane, tier) deja tombees a t_ms

def nearest_standing(x, y, my_team, destroyed) -> dict | None
    # {"lane": .., "tier": .., "distance": int}
```

**Point de correction** : une tourelle détruite ne protège plus personne. Dire
« tu étais à 2 850 unités de ta tourelle » alors qu'elle est tombée à la minute
12 est faux. `nearest_standing` ne considère que les tourelles encore debout à
l'instant de la mort, d'où le paramètre `destroyed`.

## 6. Recalls : le coût et le bénéfice

Chaque entrée de `journal["recalls"]` gagne trois blocs.

### 6.1 Coût en CS

```json
"cs_cost": {
  "window": {"from": "7:00", "to": "9:00"},
  "my_cs_gained": 11,
  "expected_cs": 16.8,
  "cs_missed_est": {"value": 6, "precision_cs": 2},
  "opp_cs_gained": 17,
  "cs_diff_swing": -6
}
```

Fenêtre : de la frame à ou avant la visite (`m0 = t0 // 60000`) jusqu'à
`m0 + 2`, soit 120 s. CS = `minionsKilled + jungleMinionsKilled`.

`expected_cs` = `baseline_cs_per_min * 2`, où `baseline_cs_per_min` est la
**médiane des deltas de CS par minute de la partie, en excluant les minutes
contenant un recall ou une mort**. Sans cette exclusion, la ligne de base est
contaminée par les événements mêmes qu'on mesure et sous-estime la perte.

`cs_missed_est.precision_cs` vaut 2, constante documentée en tête de module :
c'est le plancher de granularité imposé par les frames à 60 s. Le prompt cite
toujours l'estimation avec sa précision, jamais un chiffre nu.

Bloc omis si moins de deux frames complètes suivent la visite (fin de partie)
ou si l'adversaire de lane n'est pas résolu.

### 6.2 Bénéfice

```json
"outcome": {
  "gold_spent": 1750,
  "finished_items": [{"id": 3094, "name": "Rapid Firecannon", "cost": 2600}],
  "is_spike": true
}
```

`finished` d'un objet, dans `champion_profiles.load_items` :

```python
finished = (not item.get("into")
            and item["gold"]["total"] >= FINISHED_MIN_COST   # 1600
            and "Consumable" not in item.get("tags", []))
```

`FINISHED_MIN_COST = 1600` est une constante de tête de module : elle écarte
les bottes de tier 2 (1000 à 1100) et les composants sans successeur, tout en
gardant les objets légendaires les moins chers. Un composant comme Noonquiver
(1200) a un `into` non vide et serait de toute façon écarté.

### 6.3 Contexte adverse et conséquence

```json
"opponent_spike": {"clock": "7:52", "delta_s": 14,
                   "items": ["Kraken Slayer"]},
"death_after_visit": {"clock": "8:31", "delta_s": 53}
```

`opponent_spike` : une visite de l'adversaire de lane contenant un objet fini
dans `[t0 - 120 s, t0 + 120 s]` (`SPIKE_WINDOW_S = 120`). Les achats adverses
passent par `recalls_for`, déjà générique. Asymétrie : les objets adverses sont
lisibles au scoreboard en jeu.

`death_after_visit` : première mort du joueur dans les 90 s suivant la visite
(`RECALL_DEATH_WINDOW_S = 90`). Le retour en lane n'est pas horodaté par la
timeline ; la fenêtre couvre le trajet plus les premières secondes de lane.

Les trois clés sont omises quand vides, comme `consequences` aujourd'hui.

## 7. Morts : tracking et contexte allié

Chaque entrée de `journal["deaths"]` gagne deux blocs.

### 7.1 Indices publics du jungler ennemi

```json
"jungle_signals": {
  "champion": "Vi",
  "last": {"type": "CHAMPION_KILL", "clock": "8:12", "age_s": 40,
           "zone": "TOP", "same_side_as_death": false},
  "age_s": 40
}
```

Sont **publics**, donc admissibles :

| Événement | Pourquoi le joueur le savait |
|---|---|
| `CHAMPION_KILL` où le jungler est tueur ou assistant | kill feed |
| `ELITE_MONSTER_KILL` de sa main | annonce et HUD |
| `BUILDING_KILL`, `TURRET_PLATE_DESTROYED` de sa main | annonce |

Sont **exclus** : `WARD_KILL` (invisible hors vision), `LEVEL_UP`,
`ITEM_PURCHASED`, et toute position de frame du jungler. C'est la ligne
d'asymétrie du bloc, et elle n'est pas négociable.

Quand aucun indice n'existe avant la mort, `last` vaut `null` et `age_s`
compte depuis le début de la partie. `same_side_as_death` compare la moitié de
carte (TOP contre BOT) de l'indice et de la mort, via `approx_zone`.

### 7.2 Contexte allié

```json
"ally_context": {
  "support": {"champion": "Lulu", "zone": "TOP_JUNGLE",
              "distance": 7420, "away_from_my_zone_s": 70},
  "map_depth": 1840,
  "nearest_friendly_turret": {"lane": "BOT_LANE", "tier": "OUTER_TURRET",
                              "distance": 2850},
  "beyond_own_outer_turret": true
}
```

`support` : le `UTILITY` de mon équipe, à la frame précédant la mort.
`away_from_my_zone_s` remonte les frames tant que le support est hors de ma
zone. Bloc omis si le support n'est pas résolu.

`map_depth` : la profondeur signée de `positioning._depth`, positive en terrain
ennemi. **Elle est descriptive**, jamais prescriptive : le modèle EBM la classe
« valeur haute vers diamond », donc une profondeur élevée est un marqueur de
risque et pas un défaut à corriger. Le prompt porte déjà cette règle pour la
review agrégée ; elle est étendue au par-game.

`nearest_friendly_turret` ne considère que les tourelles debout à l'instant de
la mort. `beyond_own_outer_turret` vaut vrai quand la profondeur du joueur
dépasse celle de la tourelle extérieure encore debout de sa propre lane : c'est
le signal de prise de risque exploitable, et il est vrai ou faux, pas une
interprétation.

## 8. Sortie : catégories fermées, erreurs découpées

`schema.py`, sur `GameInsight` uniquement (la `Review` agrégée ne bouge pas) :

```python
InsightCategory = Literal[
    "TRADE_LANE", "WAVE_MANAGEMENT", "TRACKING_JUNGLE",
    "POSITIONNEMENT_COMBAT", "ECONOMIE_RECALL", "BUILD_ACHATS",
    "VISION", "OBJECTIFS", "EXECUTION_TEAMFIGHT", "GESTION_AVANCE_RETARD"]

class GameInsight(AnchoredInsight):
    category: InsightCategory
    title: Annotated[str, Field(max_length=60)]
    cause: Annotated[str, Field(max_length=350)]
    evidence: Annotated[str, Field(max_length=350)]
```

L'énumération est fermée dans le JSON-schema passé à Ollama : inventer une
catégorie est impossible par construction, comme l'horodatage obligatoire
aujourd'hui. Les plafonds de longueur rendent le pavé de 900 caractères
**invalide**, pas déconseillé : c'est la même mécanique qui a réglé le
« je sais pas pourquoi je suis mort » en rendant `cause` obligatoire.

`mistakes` passe de `min_length=3, max_length=3` à `min_length=1, max_length=5`.

**Compatibilité.** Les 27 reviews déjà persistées n'ont ni `category` ni
`title`. Elles ne sont jamais revalidées par Pydantic à la lecture
(`feedback.py` et le Worker lisent du JSON brut), mais tout consommateur qui
affiche ou agrège ces champs doit tolérer leur absence. C'est une exigence
testée, pas une intention.

## 9. Prompt

`SYSTEM_GAME` évolue ; `prompt.version_of` change donc d'empreinte et ouvre
une cohorte. Modifications :

- **Règle 4 (recalls), étendue.** Une visite sans objet fini ne peut pas être
  citée en force. Elle devient une erreur `ECONOMIE_RECALL` seulement si le
  journal mesure un coût : `cs_missed_est.value` au-dessus du seuil,
  `opponent_spike` présent, ou `death_after_visit` présent. Sinon elle n'est
  pas mentionnée. Le seuil indicatif est de 3 CS, cité **avec sa précision**
  (« environ 6 CS, à 2 près »), jamais comme un verdict au CS près. Le coach
  est explicitement autorisé à questionner le timing d'un achat au regard du
  champion joué.
- **Nouvelle règle, tracking jungle.** Pour toute mort `is_ganked_by_jungle`,
  instruire le mécanisme à partir de `jungle_signals` et `ally_context` :
  l'ancienneté du dernier indice, son côté de carte, l'absence du support, le
  dépassement de la tourelle extérieure. **Interdiction absolue d'affirmer
  quoi que ce soit sur la disponibilité des summoners** : la donnée n'existe
  pas. Interdiction de prescrire à partir de `map_depth`.
- **Nouvelle règle, une idée par erreur.** Chaque erreur porte une
  `category` de la liste fermée et un `title` de 60 caractères. Deux
  mécanismes distincts font deux erreurs, pas une longue. Regrouper reste
  autorisé quand c'est le **même** mécanisme à plusieurs horodatages.
- **Règle de format**, mise à jour : nouvelles clés, `mistakes` de 1 à 5.

## 10. Évaluation et publication

- **`grounding.py`** doit indexer les blocs neufs, sans quoi le taux
  d'ancrage chuterait artificiellement, exactement le piège rencontré la
  semaine passée avec le bloc `damage`. Nouvelles unités à cloisonner : `cs`
  (comptes de CS) et `distance` (unités de carte). Sans cloisonnement, une
  distance de 2 850 ancrerait un montant de gold de 2 850. Nouveaux
  horodatages à indexer : `jungle_signals.last.clock`,
  `death_after_visit.clock`, `opponent_spike.clock`, `cs_cost.window`.
- **`feedback.py eval_report`** gagne `by_category` : taux d'utilité ventilé
  par catégorie, obtenu en joignant chaque `FeedbackItem (kind, index)` à la
  catégorie de l'insight correspondant de la review. Les items sans catégorie
  (anciennes reviews) tombent dans un seau `"none"`.
- **`web/cf/src/evaluation.ts`** publie la même ventilation, et
  `tests/test_eval_parity.py` verrouille les clés imbriquées entre les deux
  runtimes, comme il le fait déjà pour `by_prompt_version`.
- **`web/frontend/`** affiche la catégorie en pastille et le titre en tête de
  chaque insight, avec repli propre sur les reviews sans catégorie.

## 11. Tests

| Fichier | Ce qu'il verrouille |
|---|---|
| `tests/test_turret_map.py` | le balayage échoue sur position multiple ; `nearest_standing` ignore une tourelle tombée |
| `tests/test_journal_signals.py` | fenêtre de CS, exclusion des minutes contaminées de la ligne de base, bloc omis en fin de partie ; `finished` sur bottes, composant, légendaire, consommable ; fenêtre de spike adverse ; dernier indice public et **exclusion des `WARD_KILL`** ; support absent et `beyond_own_outer_turret` |
| `tests/test_game_journal.py` | les blocs neufs apparaissent, et le journal reste identique sans catalogue injecté |
| `tests/test_coaching_payload_game.py` | `build_game` transmet le catalogue et les blocs remontent au payload |
| `tests/test_coaching_prompt.py` | les règles neuves sont présentes ; l'empreinte `version_of` a bougé |
| `tests/test_coaching_schema.py` | catégorie hors liste rejetée ; `cause` de 400 caractères rejetée ; 5 erreurs acceptées, 6 rejetées |
| `tests/test_grounding.py` | une distance n'ancre pas un gold ; les horodatages neufs sont reconnus ; le contrôle négatif reste calibré |
| `tests/test_coaching_feedback.py` | `by_category` ; une review sans catégorie tombe dans `"none"` |
| `tests/test_eval_parity.py` | clés imbriquées de `by_category` identiques Python et TypeScript |
| `tests/test_demo.py` | `make demo` reste vert de bout en bout |

## 12. Conséquences assumées

- **La comparaison de cohortes devient indicative.** Passer de 3 à 5 erreurs
  change le dénominateur du taux d'utilité. Les 17 annotations d'origine et
  les 10 reviews de la cohorte `350f7c404b5b` restent la référence figée, mais
  la comparaison chiffrée ne sera plus stricte. C'est le prix du découpage, et
  il est accepté.
- **Les 10 reviews en attente ne seront pas annotées une par une.** Le
  feedback qui a produit cette spec les a déjà jugées. Les annoter avant de
  changer le prompt coûterait une soirée pour mesurer une version qu'on
  remplace.
- **`cs_missed_est` est une estimation à plus ou moins 2 CS.** Tout le design
  en tient compte : le champ porte sa précision, la règle de prompt interdit
  le chiffre nu, et le jugement s'appuie d'abord sur `cs_diff_swing`, qui est
  relatif et donc robuste.
- **`sr_turrets.json` est figé par patch.** Un remaniement de la carte ferait
  échouer `build_turret_map.py`, ce qui est le comportement voulu.
