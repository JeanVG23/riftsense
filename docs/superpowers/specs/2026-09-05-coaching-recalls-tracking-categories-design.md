# Coaching par-game : jugement des recalls, tracking jungle, erreurs catégorisées

**Date** : 2026-09-05
**Statut** : design validé et amendé après relecture, plan à écrire
**Origine** : feedback de Jean après lecture des 10 reviews de la cohorte
`350f7c404b5b` (Priorité 0 de `todo.md`).
**Amendements après relecture** : chemin multi-agents intégré (chef 1-5,
deux empreintes) ; `VISION` retirée, sans matière ancrable au journal ;
`mock_llm` et `trim_items` suivis pour `make demo` ; mécanisme réel des
plafonds (`maxLength` = validation Pydantic + retry, 3 tentatives) ;
horloges `from`/`to` et `title` ajoutés au grounding ; complétude 20 clés /
22 positions du plan des tourelles ; mort du jungler (`victimId`) comme
indice public ; `age_s` dédupliqué ; `into: [""]` filtré ; effectif `n`
par catégorie ; perturbation `no_opponent_spike`.

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

src/core/game_journal.py      assemble : cinq appels de plus, aucune logique neuve
src/core/champion_profiles.py load_items() gagne `finished: bool`
src/04_coaching/mock_llm.py   gagne category/title par insight (make demo suit)
src/pipeline_ops/build_demo_fixtures.py  trim_items garde en plus into/tags
src/pipeline_ops/build_turret_map.py  NOUVEAU, one-shot, 0 API
data/00_static/sr_turrets.json        NOUVEAU, force-add
```

`journal_signals` reçoit l'index `_Timeline` de `game_journal` en duck-typing
(sans l'importer : l'assembleur importe déjà les signaux, l'inverse serait
circulaire). Le paramètre reste `items: dict | None = None` pour le catalogue :
les fixtures de démo le transportent tel quel, `trim_items` doit donc garder
`into` et `tags` dès que `_parse_items` les lit (cf. §6.2).

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
Il **échoue aussi si l'échantillon ne couvre pas les 20 clés / 22 positions**
attendues sur la SR : une clé manquante biaiserait silencieusement
`nearest_standing` (tourelle « debout » qui n'a jamais été observée tombée).
Un balayage de 80 timelines les couvre toutes ; un `--limit` trop bas échoue
donc, à juste titre, au lieu d'écrire une table incomplète.
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

La fenêtre inclut donc jusqu'à ~60 s de lane AVANT la visite : le CS gagné
avant le recall dilue `cs_missed_est`. C'est un choix délibéré, documenté en
tête de module : sous-estimer la perte vaut mieux qu'accuser à tort, et
l'alternative (démarrer à la frame suivant la visite) surestimerait le CS
qu'il était mécaniquement impossible de prendre.

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
into = it.get("into") or []
finished = (not [i for i in into if i]          # successeurs non vides
            and it["gold"]["total"] >= FINISHED_MIN_COST   # 1600
            and "Consumable" not in it.get("tags", []))
```

Les chaînes vides de `into` sont filtrées : Data Dragon a déjà marqué des
objets finaux d'un `into: [""]` historique, et un simple `not into` les
aurait classés composants. Vérifié sur 16.13.1 : aucun objet dans ce cas, et
6 composants ≥1600 dotés d'un `into` (Seeker's, Shattered Armguard…), tous
exclus à juste titre.

`FINISHED_MIN_COST = 1600` est une constante de tête de module : elle écarte
les bottes de tier 2 (1000 à 1100) et les composants sans successeur, tout en
gardant les objets légendaires les moins chers. Un composant comme Noonquiver
(1200) a un `into` non vide et serait de toute façon écarté.

`build_demo_fixtures.trim_items` doit garder `into` et `tags` en plus du nom
et du coût : « Ne garde que ce que `_parse_items` lit » est son contrat. Sans
cela, la démo classerait fini tout objet ≥1600 (fausse divergence
prod/démo, invisible au test de parité).

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
  "age_s": 40,
  "last": {"type": "CHAMPION_KILL", "clock": "8:12",
           "zone": "TOP", "same_side_as_death": false}
}
```

`age_s` vit au niveau du bloc uniquement : c'est l'âge du dernier indice (ou
depuis le début de partie s'il n'y en a pas). Le dupliquer dans `last`
exposerait deux valeurs que le LLM pourrait croire contradictoires.

Sont **publics**, donc admissibles :

| Événement | Pourquoi le joueur le savait |
|---|---|
| `CHAMPION_KILL` où le jungler est tueur ou assistant | kill feed |
| `CHAMPION_KILL` où le jungler est la victime | kill feed : un jungler mort ne peut pas ganker, c'est l'indice le plus fort |
| `ELITE_MONSTER_KILL` de sa main | annonce et HUD |
| `BUILDING_KILL`, `TURRET_PLATE_DESTROYED` de sa main | annonce |

La mort du jungler est un indice sur son ancienne position uniquement : le
bloc ne modélise PAS son respawn ni sa position après mort, et le prompt
n'affirme jamais où il se trouve maintenant.

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
    "OBJECTIFS", "EXECUTION_TEAMFIGHT", "GESTION_AVANCE_RETARD"]

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

**`VISION` est retirée de la liste.** Le journal par-game ne contient aucune
matière de vision ancrable (pas de `WARD_PLACED` du joueur ; les proxys
`ML_ONLY` de `positioning` sont exclus par l'asymétrie) : une erreur
`VISION` serait inévitablement non ancrée, tag « stat-inventée » assuré. Elle
reviendra le jour où le journal portera des blocs de wards du joueur
(asymétrie-safe : `WARD_PLACED` porte `participantId`), si le coaching de
vision devient un objectif.

**Mécanisme des plafonds.** La grammaire JSON d'Ollama contraint
`minItems`/`maxItems`, pas `maxLength` sur les chaînes : les plafonds de
longueur s'appliquent donc à la validation Pydantic, via le retry de
`_generate` (tentatives rejetées comptées dans `schema_retries`). Pour
absorber le surplus de contraintes de cette cohorte, `_generate` passe de 2 à
**3 tentatives** : un pavé récidiviste coûte des tokens, pas la game.

`mistakes` passe de `min_length=1, max_length=3` (état actuel ; c'est la
`Review` agrégée qui est fixée à 3) à `min_length=1, max_length=5`.

**Compatibilité.** Les 27 reviews déjà persistées n'ont ni `category` ni
`title`. Elles ne sont jamais revalidées par Pydantic à la lecture
(`feedback.py` et le Worker lisent du JSON brut), mais tout consommateur qui
affiche ou agrège ces champs doit tolérer leur absence. C'est une exigence
testée, pas une intention.

**`make demo` suit ou casse.** `mock_llm._game_review` doit émettre
`category` et `title` (obligatoires au schéma, la validation de la démo
échouerait sinon) et citer au moins un bloc neuf quand il est présent (ex.
`cs_cost` sur le recall choisi) : le mock n'est utile que parce qu'il
traverse le vrai chemin et ne cite que du matériel réel. Le chemin
multi-agents reste hors démo (le chef exige une sélection d'IDs que le mock
ne produit pas), comme aujourd'hui.

**Chemin multi-agents (`--specialized`).** `AxisReview` hérite de
`GameReview` : `category`/`title` s'appliquent aux deux sous-agents sans
travail supplémentaire, et `_axis_payload` laisse passer les morts et les
recalls complets : les blocs neufs atteignent naturellement l'axe concerné.
Trois conséquences à écrire :

- `ChiefSelection.priority_mistake_ids` passe de `max_length=3` à
  `max_length=5` : sans cela, la review finale assemblée resterait plafonnée
  à 3 erreurs et la motivation du §1.3 ne vaudrait que pour le mono-agent.
  `SYSTEM_CHIEF` suit (« 1 à 5 erreurs »).
- **Deux empreintes bougent**, pas une : `GAME_PROMPT_VERSION` et
  `SPECIALIZED_PROMPT_VERSION` (dérivée de `SYSTEM_GAME` + axes + chef,
  donc entraînée par les mêmes règles). Les cohortes restent séparées par
  `run.prompt_version`, comme aujourd'hui.
- Les axes partagent la même liste fermée, sans restriction par axe : la
  matière disponible dans la tranche de payload de chaque axe fait déjà le
  tri (une erreur `TRACKING_JUNGLE` ne peut pas sortir de l'axe économie,
  faute de `jungle_signals` ancrable dans sa tranche).

## 9. Prompt

`SYSTEM_GAME` évolue ; `prompt.version_of` change donc d'empreinte et ouvre
une cohorte. **Deux empreintes bougent en fait** : `GAME_PROMPT_VERSION` et
`SPECIALIZED_PROMPT_VERSION` (les axes dérivent de `SYSTEM_GAME`, cf. §8).
Modifications :

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
  pas. Interdiction de prescrire à partir de `map_depth`. Interdiction
  d'affirmer où se trouve le jungler maintenant : le journal ne donne que des
  indices datés.
- **Nouvelle règle, une idée par erreur.** Chaque erreur porte une
  `category` de la liste fermée et un `title` de 60 caractères. `title` est
  l'ÉTIQUETTE standardisée du mécanisme (pour lire d'un coup d'œil et
  compter entre parties) ; `point` est la LEÇON complète. Ne recopie pas
  `point` dans `title`. Deux mécanismes distincts font deux erreurs, pas une
  longue. Regrouper reste autorisé quand c'est le **même** mécanisme à
  plusieurs horodatages.
- **Règle de format**, mise à jour : nouvelles clés `category`/`title` sur
  forces et erreurs, `mistakes` de 1 à 5 ; `SYSTEM_CHIEF` passe à « 1 à 5
  erreurs ».

## 10. Évaluation et publication

- **`grounding.py`** doit indexer les blocs neufs, sans quoi le taux
  d'ancrage chuterait artificiellement, exactement le piège rencontré la
  semaine passée avec le bloc `damage`. Les unités `cs` et `u` (distance)
  existent déjà dans `UNITS`, et les blocs neufs héritent de la bonne unité
  par leur nom de clé (`cs_cost` transmet `cs` à ses enfants, `distance` →
  `u`) : le cloisonnement demandé est déjà en place pour eux. Deux vrais
  chantiers :
  - `_collect_clocks` ne collecte que les clés `clock` :
    `cs_cost.window` (`{"from": "7:00", "to": "9:00"}`) est invisible.
    Étendre la collecte aux clés `from`/`to` dont la valeur matche le
    motif `mm:ss` (le garde-fou du motif évite de ramasser un `from`/`to`
    étranger aux horloges). Les horodatages `jungle_signals.last.clock`,
    `death_after_visit.clock` et `opponent_spike.clock` sont déjà couverts
    par la collecte actuelle.
  - `asymmetry_violations` n'examine que `point`/`cause`/`evidence` : un
    `title` « surextension à répétition » échapperait au contrôle
    descriptif. Ajouter `title` aux clés examinées.
- **`feedback.py eval_report`** gagne `by_category` : taux d'utilité ventilé
  par catégorie, obtenu en joignant chaque `FeedbackItem (kind, index)` à la
  catégorie de l'insight correspondant de la review. Les items sans catégorie
  (anciennes reviews) tombent dans un seau `"none"`. **Chaque seau expose son
  effectif `n`** : à 10-27 annotations sur 9 catégories, un taux sans effectif
  est du bruit, la plupart des seaux seront vides ou presque.
- **`web/cf/src/evaluation.ts`** publie la même ventilation (avec `n`), et
  `tests/test_eval_parity.py` verrouille les clés imbriquées entre les deux
  runtimes, comme il le fait déjà pour `by_prompt_version`.
- **`counterfactual.py`** gagne une perturbation `no_opponent_spike` :
  retirer les blocs `opponent_spike` des recalls du payload, régénérer, et
  vérifier que le coach cesse de citer un spike adverse. Sans elle, les
  blocs neufs passeraient l'éval de la cohorte sans jamais être testés en
  sensibilité. Les sorties restent dans `eval/`, jamais dans `reviews.jsonl`.
- **`web/frontend/`** affiche la catégorie en pastille et le titre en tête de
  chaque insight, avec repli propre sur les reviews sans catégorie.

## 11. Tests

| Fichier | Ce qu'il verrouille |
|---|---|
| `tests/test_turret_map.py` | le balayage échoue sur position multiple ET sur effectif incomplet (< 20 clés / 22 positions) ; `nearest_standing` ignore une tourelle tombée |
| `tests/test_journal_signals.py` | fenêtre de CS, exclusion des minutes contaminées de la ligne de base, bloc omis en fin de partie ; `finished` sur bottes, composant, légendaire, consommable ET `into: [""]` ; fenêtre de spike adverse ; dernier indice public y compris la MORT du jungler (`victimId`), et **exclusion des `WARD_KILL`** ; support absent et `beyond_own_outer_turret` |
| `tests/test_game_journal.py` | les blocs neufs apparaissent, et le journal reste identique sans catalogue injecté |
| `tests/test_coaching_payload_game.py` | `build_game` transmet le catalogue et les blocs remontent au payload |
| `tests/test_coaching_prompt.py` | les règles neuves sont présentes ; les DEUX empreintes ont bougé (`GAME_PROMPT_VERSION`, `SPECIALIZED_PROMPT_VERSION`) ; `SYSTEM_CHIEF` dit « 1 à 5 » |
| `tests/test_coaching_schema.py` | catégorie hors liste rejetée ; `cause` de 400 caractères rejetée ; `title` de 61 rejeté ; 5 erreurs acceptées, 6 rejetées ; la sélection du chef accepte 5 erreurs, rejette 6 |
| `tests/test_grounding.py` | une distance n'ancre pas un gold ; les horodatages neufs sont reconnus, y compris `window.from`/`window.to` ; un `title` descriptif est signalé par `asymmetry_violations` ; le contrôle négatif reste calibré |
| `tests/test_coaching_feedback.py` | `by_category` avec effectif `n` par seau ; une review sans catégorie tombe dans `"none"` |
| `tests/test_eval_parity.py` | clés imbriquées de `by_category` identiques Python et TypeScript |
| `tests/test_counterfactual.py` | `no_opponent_spike` : sans le bloc, le coach ne cite plus le spike adverse |
| `tests/test_demo.py` | `make demo` reste vert de bout en bout ; les items des fixtures portent `into`/`tags`, le mock émet `category`/`title` |

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
- **`expected_cs` reste un float.** Le coach qui cite « 17 CS » pour 16,8 est
  couvert par le repli d'arrondi de `classify_number` (`round(c) == value`),
  vérifié : inutile de dériver un entier, la citation arrondie est légitime.
- **`sr_turrets.json` est figé par patch.** Un remaniement de la carte ferait
  échouer `build_turret_map.py`, ce qui est le comportement voulu.
