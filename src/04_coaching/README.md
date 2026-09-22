# 04_coaching — Narration LLM du coaching

Compte-rendu de coaching agrégé, narré par un LLM (Ollama Cloud, structured output)
à partir d'un payload déterministe dérivé du diff perso ↔ référentiel.

Le coaching global et le coaching par partie restent séparés. Sur le site, il n'existe
qu'un seul coaching global par joueur : toujours `overall`, sur le rôle principal déjà
sélectionné pour l'analyse ML/SHAP par `service/main_role.py`. Le navigateur ne choisit
ni le rôle ni l'issue ; le Worker relit la décision persistée dans `shap:<slug>:role` et
charge le benchmark correspondant. Toutes les métriques du bilan viennent des parties
réelles de ce rôle. Les causes qualitatives sont ajoutées ensuite avec un échantillon
borné : aucune review (`none`), une seule review lorsque seule
une issue existe (`unbalanced`), ou un ensemble symétrique de 2 victoires + 2 défaites au
maximum (`balanced`). Les compteurs `available_*` et `used_*` distinguent toujours le
corpus disponible de ce qui est réellement envoyé au LLM ; cette parité ne représente pas
le winrate du joueur.

## Pipeline

```
gold (perso + référentiel) → payload.build (déterministe) → prompt.render
   → llm_client.generate (Ollama Cloud, format=JSON-schema) → (sortie, télémétrie)
   → schema.Review (validation Pydantic) → render_text (FR) + persiste reviews.jsonl
```

## Modules

| Fichier | Rôle |
|---|---|
| `payload.py` | gold perso+réf → payload déterministe, **safe-only** ; par-game : fatal damage, matchup complet et prochain achat réel |
| `prompt.py` | system (asymétrie + benchmark-relatif + règle format, FR) + user |
| `schema.py` | Pydantic `Review` agrégée inchangée ; par-game : 0–2 forces, 1–5 erreurs, `category` fermée, `title` court et textes plafonnés ; schémas d'agents spécialisés |
| `llm_client.py` | client `https://ollama.com/api/chat`, `OLLAMA_API_KEY`, `format`=JSON-schema, retries 429/5xx. `generate` renvoie aussi la télémétrie du run (latence, tokens, coût) |
| `coach.py` | CLI : payload→prompt→client→validation→affiche+persiste. `DEFAULT_MODEL = "kimi-k2.6"` |

## Usage

Le CLI conserve `--scope` et `--outcome` pour les expériences hors production. Le flux web
les force depuis le rôle principal et utilise `overall`.

```bash
python3 src/04_coaching/coach.py --player spadzze --scope adc [--outcome loss] \
                                  [--target challenger] [--model kimi-k2.6]

# 2 sous-agents en parallèle + chef (3 appels par partie)
python3 src/04_coaching/coach.py --player spadzze --game EUW1_x --specialized
```

Résolution du modèle : `--model` (CLI) > `OLLAMA_MODEL` (shell env) > `OLLAMA_MODEL` (`.env`)
> `DEFAULT_MODEL`. Sortie persistée dans `data/07_coaching/<player>/reviews.jsonl`
(1 ligne JSON par run : `ts`, `model`, `scope`, `target`, `outcome_focus`, `payload`,
`review`, `run`).

### Le bloc `run` (traçabilité)

Chaque review persistée porte sa trace d'exécution :

| Champ | Sens |
|---|---|
| `prompt_version` | empreinte du system prompt (`prompt.version_of`) — **dérivée du texte**, pas un numéro à incrémenter : oublier un bump est impossible |
| `latency_ms` / `total_tokens` | coût réel de la génération, **retries de schéma inclus** (une sortie rejetée a bien coûté un appel) |
| `prompt_tokens` / `completion_tokens` / `server_duration_ms` | détail renvoyé par Ollama ; `None` si absent, jamais `0` |
| `schema_retries` | nombre de sorties rejetées par Pydantic avant succès |
| `cost_usd` | `None` par défaut : Ollama Cloud est facturé à l'abonnement. Renseigner `llm_client.PRICE_PER_MTOK` suffit à l'obtenir |

Sans ce bloc, une variation du taux d'utilité n'est attribuable ni au prompt ni au
modèle : la boucle d'éval mesure sans savoir ce qu'elle mesure.

### Exécution web d'une partie

`sync_cloudflare.py` construit localement, sans réseau, un bundle de payloads unitaires
nettoyés à partir du raw Riot déjà en cache. Le Worker ne reçoit jamais le raw :
`POST /api/coach/game` lit l'entrée demandée, réutilise gratuitement une review existante
ou, sur régénération explicite, persiste une nouvelle ligne avec
`run.prompt_version` et `run.payload_hash`. Le verrou Durable Object du site sérialise les
générations globales et unitaires d'un même joueur.

---

## Boucle d'évaluation (`feedback.py`)

Ferme le « ce conseil était-il utile ? » sur les reviews persistées — **sans
re-générer**. CLI interactive par-insight, tag fixe sur jugement négatif.

```bash
python3 src/04_coaching/feedback.py annotate --player spadzze   # choisir + juger
python3 src/04_coaching/feedback.py summary  --player spadzze   # agrégation
```

- **annotate** : liste les reviews (`ts`/modèle/issue), défile les insights puis le focus
  (et les habitudes pour l'agrégé), prompt `y/n/s` (+ tag numéroté + note sur `n`). `--ts <ts>`
  ou `--last` court-circuithe la sélection. Persiste dans
  `data/07_coaching/<player>/feedback.jsonl` (1 ligne/review ; réannotation écrase).
- **summary** : taux d'utilité global + par section + par catégorie (avec `n`), top tags
  (conseils faux), par modèle, tendance (5 dernières vs précédentes ; low_sample `<10`). Filtres
  `--tag <t>` / `--model <m>`. `--json` sort le rapport machine (`eval_report`)
  publié sur le site et la page CV.
- `--pending` enchaîne toutes les reviews non annotées (le chemin normal pour
  fermer la boucle sur un lot de reviews par-game).
- **Tags** : `asymetrie`, `stat-inventee`, `profondeur-en-faute`, `trop-vague`,
  `non-actionnable`, `autre` — ciblent les modes d'échec connus du prompt
  (règles 1/2/3). Le **top tag** est le signal actionnable pour durcir le prompt
  (ex : `profondeur-en-faute` qui domine → régression de règle 3).

Schéma Pydantic partagé : `schema.FeedbackItem` (kind/index/useful/tag/note,
invariant *tag requis si useful=False*) + `schema.Feedback`. Aucun appel réseau.

### Critère de succès et publication

**≥70 % d'erreurs jugées utiles sur ≥10 analyses par-partie annotées** (constantes
`_OBJECTIVE_RATE` / `_OBJECTIVE_N`). La métrique ne retient que les `mistakes` des
reviews `kind: "game"` : ce sont les seules vérifiables moment par moment.

Le taux est affiché sur le site en tête de l'onglet Coaching, **atteint ou non**.
Il est recalculé à la lecture par le Worker (`web/cf/src/evaluation.ts`,
`GET /api/c/<slug>/eval`) et non poussé précalculé : les annotations arrivent
aussi du site lui-même, un blob figé au dernier sync afficherait un taux périmé.
Les deux implémentations (Python pour la CLI, TypeScript pour le site) sont
verrouillées sur les mêmes seuils par `tests/test_eval_parity.py`.

Les annotations et reviews locales rejoignent KV via :

```bash
poetry run python3 src/collection/sync_cloudflare.py --push-coaching   # fusion, pas écrasement
# publication ciblée des seules reviews/annotations d'un compte
poetry run python3 src/collection/sync_cloudflare.py --slug spadzze --coaching-only
```

---

## Évaluation automatique (0 humain) : ancrage + contrefactuels

L'annotation mesure l'**utilité**, qui est un jugement. Deux familles de contrôles
mesurent ce qui la précède et se calcule sans personne : la **fidélité au payload**
et la **sensibilité à l'entrée**. Elles tournent sur les reviews déjà persistées.

### `grounding.py` — les chiffres cités existent-ils ?

Le prompt pose « n'invente aucune stat absente du payload » (règle 2) et le schéma
`AnchoredInsight` vérifie la PRÉSENCE d'un `mm:ss`, jamais sa VÉRACITÉ : une
evidence citant 22:07 quand la mort est à 15:13 passait la validation Pydantic.

```bash
python3 src/04_coaching/grounding.py --player spadzze [--details] [--json]
```

Trois mesures : chiffres ancrés, horodatages ancrés, violations d'asymétrie (une
feature `descriptive_only` présentée comme une faute).

**Le point de conception : le cloisonnement par unité.** Rapprocher un chiffre de
n'importe quelle valeur du payload ne prouve rien — un journal contient des
centaines de nombres. Les valeurs sont donc indexées par unité (`g`, `cs`, `pct`,
`s`, `min`, `u`, `n`, `morts`), déduite de l'unité déclarée par le payload agrégé,
sinon du chemin du champ ; un « 1 225 g » ne peut s'ancrer que sur un montant d'or.
Sont admis en plus : les dénombrements et parts dérivables du journal (« 4 morts
en BOT », « 60 % de tes morts »), les nombres portés par les noms de métriques
(`gd14`), la valeur absolue (« -364 g challenger ») et l'arrondi entier d'une part.

**Le détecteur est calibré par contrôle négatif** (`tests/test_grounding.py`) : on
falsifie les chiffres de reviews réelles et on mesure le taux de rejet. À 5 % de
tolérance d'arrondi il n'attrapait que 56 % des falsifications ; `ROUNDED_REL`
vaut donc 1 %, ce qui en rejette ~91 % sans perdre les citations légitimes.
Un taux d'ancrage sans mesure de puissance ne veut rien dire.

### `counterfactual.py` — le coach lit-il le payload ?

Un coach peut être parfaitement ancré et totalement insensible : réciter « tu meurs
en BOT early » est plausible pour presque toute game d'ADC. On perturbe donc UNE
dimension du payload, on régénère, et on vérifie que la sortie suit.

```bash
python3 src/04_coaching/counterfactual.py --player spadzze --n 3 [--dry-run]
# après un incident transitoire, reprendre seulement les appels techniques en erreur
python3 src/04_coaching/counterfactual.py --player spadzze --retry-errors
```

| perturbation | attente vérifiable |
|---|---|
| `no_deaths` | journal pauvre → `confidence` baisse (règle 7 du prompt) |
| `zone_to_top` | les morts citées basculent en TOP |
| `unspent_gold_zero` | le gold non dépensé cité s'effondre |
| `no_opponent_spike` | les objets du spike adverse retiré cessent d'être cités |

La review déjà persistée sert de référence : une perturbation coûte **un** appel.
Chaque sortie perturbée est en plus passée à `grounding` **contre le payload
perturbé** : un modèle qui récite les chiffres de la game d'origine voit son
ancrage chuter, ce qui sépare « il a lu » de « il a deviné ».

Le rapport va dans `data/07_coaching/<player>/eval/counterfactual.json`, **hors**
de `reviews.jsonl` : une sortie contrefactuelle n'est pas une review du joueur,
elle ne doit ni être annotée ni remonter sur le site.

### A/B reproductible sur le payload enrichi

`model_ab.py` regénère une baseline propre à chaque modèle, puis rejoue les quatre
perturbations. Il compare ancrage, sensibilité, erreurs, retries de schéma, tokens et
latence sans annotation humaine. Les valeurs par défaut sont `kimi-k2.6` et `glm-5.3`.

```bash
python3 src/04_coaching/model_ab.py --player spadzze --n 3 --dry-run
python3 src/04_coaching/model_ab.py --player spadzze --n 3
```

Le rapport est écrit dans `data/07_coaching/<player>/eval/model_ab.json`, jamais dans
le corpus de reviews.

---

## A/B testing des modèles (2026-06-30)

### Essai `deepseek-v4.1-flash` sur le prompt enrichi (2026-09-21)

Neuf reviews ont complété la review Kimi déjà présente sous le prompt
`e1f3a4cb13da`. DeepSeek a produit 9/9 sorties valides sans retry, en 94,6 s de
latence médiane (772 s cumulées). Les horodatages sont tous exacts (271/271) et
l'asymétrie ne remonte aucune violation. En revanche, l'ancrage numérique strict
n'est que de 81,2 % : le modèle compacte les preuves (`Stormrazor (3200)`,
`Yasuo 550`, `19 vs 17`) sans répéter l'unité. Ces valeurs existent dans le payload,
mais le contrôleur refuse à raison de les rapprocher de n'importe quel nombre sans
unité. Le modèle est donc un candidat de latence, pas encore un candidat publiable ;
le prompt doit imposer des unités explicites avant une nouvelle cohorte homogène.

Le prompt suivant `07692894c681` impose l'unité ou le sens du champ pour chaque chiffre.
Les **mêmes 10 games** ont été rejouées avec `deepseek-v4.1-flash` uniquement : 10/10
sorties valides, aucun retry, latence médiane 93,2 s (890,9 s cumulées), 359 128 tokens.
Le gate automatique passe avec **91,8 %** d'ancrage strict (669/729 chiffres, dont 645
exacts), 308/308 horodatages exacts et 0 violation d'asymétrie. Le détecteur accepte la
notation anglaise des milliers (`3,200`) comme l'équivalent de `3200`, mais conserve le
cloisonnement par unité ; les 60 raccourcis résiduels comme `847 of 1,260 damage` restent
donc refusés. Cette cohorte est éligible à l'annotation humaine, mais n'est pas publiée.

L'annotation humaine a ensuite été explicitement sautée. Les 12 contrefactuels
(3 games × 4 perturbations) donnent **91,7 %** de sensibilité et **95,7 %** de grounding,
sans erreur technique après reprise ciblée. `no_deaths`, `unspent_gold_zero` et
`no_opponent_spike` passent 3/3 ; `zone_to_top` passe 2/3, soit un défaut réel de
sensibilité spatiale sur une game. Le lot démontre donc une bonne fidélité mécanique,
pas une utilité utilisateur nouvellement mesurée, et reste non publié.

**Protocole** : même payload (`spadzze`, scope `adc`, issue `loss`, vs challenger) rejoué sur
4 modèles d'Ollama Cloud. Comparaison sur 5 critères : conformité au schéma, respect de
l'asymétrie (règle 1), profondeur traitée comme observation neutre (règle 3), concret &
benchmark-relatif (règle 4), exploitation du benchmark contextuel de lane.

Catalogue récupéré via `GET https://ollama.com/api/tags` (35 modèles disponibles).
`kimi-k2.7` n'existe qu'en variante `-code` (orientée code) ; `kimi-k2.6` est l'équivalent
général retenu.

### Résultats

| Modèle | Conf. | Format | Règle 3 (profondeur neutre) | Benchmark contextuel | Verdict |
|---|---|---|---|---|---|
| `deepseek-v4-pro` | 0.60 | OK **après durcissement du prompt** | neutre (« écart typique de rang ») | non | baseline, plate |
| `glm-5.2` | 0.55 | OK natif | non mentionnée (sûr) | non | la plus concise, deltas bien mis en forme |
| `minimax-m3` | 0.50 | OK natif | non mentionnée (sûr) | **oui** (`all-in : -429 g @10 vs +24 g`) | narration la plus riche, exploite `context_benchmark` |
| `kimi-k2.6` | 0.60 | OK natif | **la meilleure** (« marqueurs descriptifs de ton rang, pas des fautes ») | non | respecte le plus fidèlement l'asymétrie/règle 3 |

Tous conformes au schéma (3 forces / 3 erreurs / 2 habitudes, clés anglaises exactes,
habits en chaînes). Aucun reproche fondé sur info cachée (asymétrie tenue bout-en-bout).

### Classement

```
kimi-k2.6  ≥  minimax-m3  >  glm-5.2  >  deepseek-v4-pro
```

### Enseignements

1. **Le durcissement du prompt est model-agnostic.** Les 4 modèles honorent le schéma
   après la règle 7 de `prompt.SYSTEM` (JSON strict + clés anglaises exactes + habits en
   chaînes). C'est cette règle qui porte la conformité, **pas** la contrainte `format`
   d'Ollama — `deepseek-v4-pro` l'ignorait pour les schémas complexes (d'où le durcissement,
   commit `5ced84b`). Confirme in vivo la thèse projet : la qualité vient du prompt + des
   features, pas du modèle. Le LLM ne fait que raconter.
2. **Discriminateur = la règle 3 (asymétrie/profondeur).** Seul `kimi-k2.6` cadre
   explicitement profondeur + overextension comme marqueurs descriptifs de rang, pas
   comme des fautes — exactement l'intent de la règle 3 durcie. `minimax-m3` se distingue
   par l'exploitation du `context_benchmark` (le seul à citer le pattern `all-in`).
3. **Choix du défaut** : `kimi-k2.6` retenu pour le respect maximal de l'asymétrie, principe
   non-négociable du projet. `minimax-m3` à privilégier si l'on veut exploiter le benchmark
   contextuel de lane. Surclassable à tout moment via `--model`.

### Reproduction

```bash
for m in deepseek-v4-pro glm-5.2 minimax-m3 kimi-k2.6; do
  python3 src/04_coaching/coach.py --player spadzze --scope adc --outcome loss --model $m
done
# comparer : chaque run append une ligne dans data/07_coaching/spadzze/reviews.jsonl
poetry run python3 -c "import json,pathlib; [print(r['model'], r['review']['confidence']) \
  for r in (json.loads(l) for l in pathlib.Path('data/07_coaching/spadzze/reviews.jsonl').read_text().splitlines() if l.strip())]"
```
