# Priorité 0 : valider l'incrément LLM enrichi (plan d'exécution)

> **Pour les workers agentiques :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent la syntaxe checkbox (`- [ ]`) pour le suivi.

**Goal :** mesurer la qualité du coach LLM **courant** (payload enrichi : dégâts fatals,
matchup, achats réels) sur un lot frais de reviews par-partie, et rendre cette mesure
comparable à l'ancienne cohorte au lieu de la noyer dans une moyenne unique.

**Architecture :** les 17 annotations existantes ont été produites avant l'enrichissement et
portent `run.prompt_version = null` ; les nouvelles porteront `350f7c404b5b`. Ce champ est
donc la clé de cohorte, déjà persistée, déjà lue par `grounding.py`. Trois tâches de code
ajoutent la dimension cohorte aux deux rapports (Python et Worker TS), puis cinq tâches
opérationnelles génèrent, évaluent automatiquement, annotent, comparent et consignent.

**Tech Stack :** Python 3 (Poetry), pytest, Ollama Cloud (`kimi-k2.6`), TypeScript
(Cloudflare Worker), Cloudflare KV.

**Spec :** `todo.md`, section « ⚡ Priorité 0 » (valider l'incrément LLM enrichi).

## Global Constraints

- Lancer depuis la racine du repo, dans l'environnement Poetry : `poetry run python3 …`.
- **0 appel Riot API.** Les 38 parties ADC non reviewées sont déjà en silver et leur raw
  (`_match.json.zst` + `_timeline.json.zst`) est présent en `data/01_raw/`. Vérifié.
- Modèle par défaut `kimi-k2.6` (`coach.py:35`), sans `--model` ni `--specialized` pour le
  lot principal : on mesure le chemin réellement servi.
- Rédaction française sans tiret cadratin, dans le code, les messages de commit et les docs.
- `data/` est gitignoré : ne jamais tenter de committer reviews, feedbacks ou eval.
- Ne pas faire échouer `tests/test_eval_parity.py` : toute clé ajoutée à `eval_report`
  doit exister des deux côtés (Python et `web/cf/src/evaluation.ts`).
- Suite complète : `poetry run pytest tests/` (le garde-fou libomp de `tests/conftest.py`
  est requis sur macOS, ne pas le contourner).

## État vérifié au 2026-09-04 (à ne pas re-mesurer)

| Fait                                              | Valeur                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| Parties ADC perso en silver                       | 49, dont **38 non reviewées**                       |
| Raw disponible pour les 10 prochaines             | oui (match + timeline `.zst`)                       |
| `prompt_version` des 17 reviews existantes        | `null` (le bloc `run` est postérieur)               |
| `prompt.version_of(SYSTEM_GAME)` courant          | `350f7c404b5b`                                      |
| Ancrage cohorte A (12 reviews `kind=game`)        | 210 nombres, ancrés 98,6 %, exacts 96,2 %, 3 non ancrés |
| Horodatages cohorte A                             | 108 horloges, ancrées 100 %, exactes 98,1 %         |
| Violations d'asymétrie cohorte A                  | 0                                                   |
| Objectif produit cohorte A                        | 12 reviews annotées, mistakes utiles **96,4 %**     |
| Utilité par section (17 reviews, 92 items)        | global 87,0 % · forces 72,7 % · erreurs 93,0 % · habitudes 80,0 % · focus 94,1 % |
| Tags négatifs dominants                           | `non-actionnable` ×6, `trop-vague` ×4, `autre` ×2   |

Ces chiffres sont la **baseline de comparaison**. Les reproduire n'apporte rien : les tâches
ci-dessous les citent.

---

### Task 1 : cohorte `prompt_version` dans `grounding.py`

**Files :**
- Modify : `src/04_coaching/grounding.py` (fonction `report`, ligne ~386 ; `main`, ligne ~426)
- Test : `tests/test_grounding.py` (à la suite de `test_report_aggregates_over_a_reviews_file`)

**Interfaces :**
- Consumes : `feedback_mod.list_reviews(player, root)` (existant), `check_review` (existant).
- Produces : `grounding.report(player, root=None, kind=None, prompt_version=None) -> dict`.
  La valeur sentinelle `"none"` sélectionne les reviews **sans** `run.prompt_version`.
  Le rapport gagne la clé `"prompt_version"` (l'écho du filtre demandé, ou `None`).

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `tests/test_grounding.py` :

```python
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
```

- [ ] **Step 2 : lancer le test et vérifier qu'il échoue**

Run : `poetry run pytest tests/test_grounding.py::test_report_filters_on_prompt_version -v`
Attendu : ÉCHEC, `TypeError: report() got an unexpected keyword argument 'prompt_version'`.

- [ ] **Step 3 : implémenter le minimum**

Dans `src/04_coaching/grounding.py`, remplacer la signature et le filtrage de `report` :

```python
def report(player: str, root=None, kind: str | None = None,
           prompt_version: str | None = None) -> dict:
    records = feedback_mod.list_reviews(player, root)
    if kind:
        records = [r for r in records
                   if (r.get("kind") or "aggregate") == kind]
    if prompt_version:
        # "none" cible les reviews d'avant le bloc `run` (pas de version tracée) :
        # sans ce sentinelle, la cohorte historique serait inatteignable.
        wanted = None if prompt_version == "none" else prompt_version
        records = [r for r in records
                   if (r.get("run") or {}).get("prompt_version") == wanted]
    checks = [check_review(r) for r in records]
```

puis ajouter la clé au dict retourné, juste après `"player": player,` :

```python
        "prompt_version": prompt_version,
```

- [ ] **Step 4 : lancer le test et vérifier qu'il passe**

Run : `poetry run pytest tests/test_grounding.py -v`
Attendu : PASS (l'ancien `test_report_aggregates_over_a_reviews_file` reste vert).

- [ ] **Step 5 : brancher le CLI**

Dans `main` de `grounding.py`, après l'argument `--kind` :

```python
    ap.add_argument("--prompt-version", default=None,
                    help="filtre une cohorte de prompt ('none' = reviews sans run)")
```

et passer le filtre :

```python
    rep = report(args.player, kind=args.kind, prompt_version=args.prompt_version)
```

- [ ] **Step 6 : vérifier sur les données réelles**

Run : `poetry run python3 src/04_coaching/grounding.py --player spadzze --kind game --prompt-version none --json | head -20`
Attendu : `"n_reviews": 12` et `"grounded_rate"` ≈ 0.9857 (la baseline cohorte A du tableau).

Run : `poetry run python3 src/04_coaching/grounding.py --player spadzze --kind game --prompt-version 350f7c404b5b --json | head -8`
Attendu : `"n_reviews": 0` (le lot frais n'existe pas encore).

- [ ] **Step 7 : commit**

```bash
git add src/04_coaching/grounding.py tests/test_grounding.py
git commit -m "feat(grounding): filtre de cohorte par prompt_version"
```

---

### Task 2 : cohorte `prompt_version` dans `feedback.py`

**Files :**
- Modify : `src/04_coaching/feedback.py` (nouvelle fonction `cohort_of` + `by_prompt_version`
  dans `eval_report` ligne ~216 ; `main` ligne ~374)
- Test : `tests/test_coaching_feedback.py`

**Interfaces :**
- Consumes : `load_feedbacks`, `list_reviews`, `objective_stats`, `summarize` (existants).
- Produces :
  - `feedback.cohort_of(reviews) -> dict[str, str]` : `ts` de review vers cohorte
    (`prompt_version`, ou `"none"` quand le bloc `run` est absent).
  - `feedback.filter_cohort(fbs, reviews, version) -> list[Feedback]`.
  - `eval_report(...)` gagne la clé `by_prompt_version` :
    `dict[str, {"n_game_reviews_annotated": int, "mistake_useful_rate": float | None,
    "n_items": int, "global_rate": float | None}]`.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `tests/test_coaching_feedback.py` :

```python
def test_eval_report_splits_cohorts_by_prompt_version(tmp_path):
    root = tmp_path / "07_coaching"
    (root / "p").mkdir(parents=True)
    reviews = [
        {"ts": "t1", "kind": "game", "match_id": "EUW1_1", "model": "kimi-k2.6",
         "run": {}},
        {"ts": "t2", "kind": "game", "match_id": "EUW1_2", "model": "kimi-k2.6",
         "run": {"prompt_version": "350f7c404b5b"}},
    ]
    (root / "p" / "reviews.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in reviews) + "\n")
    feedbacks = [
        {"ts": "t1", "player": "p", "model": "kimi-k2.6",
         "rated_at": "2026-09-04T12:00:00",
         "items": [{"kind": "mistake", "index": 0, "useful": False,
                    "tag": "trop-vague", "note": None}]},
        {"ts": "t2", "player": "p", "model": "kimi-k2.6",
         "rated_at": "2026-09-04T12:00:01",
         "items": [{"kind": "mistake", "index": 0, "useful": True,
                    "tag": None, "note": None}]},
    ]
    (root / "p" / "feedback.jsonl").write_text(
        "\n".join(json.dumps(f, ensure_ascii=False) for f in feedbacks) + "\n")

    rep = F.eval_report("p", root=root)
    cohorts = rep["by_prompt_version"]
    assert cohorts["none"]["mistake_useful_rate"] == 0.0
    assert cohorts["350f7c404b5b"]["mistake_useful_rate"] == 1.0
    assert cohorts["none"]["n_game_reviews_annotated"] == 1
    # la métrique globale reste celle de l'objectif produit, toutes cohortes
    assert rep["objective"]["mistake_useful_rate"] == 0.5
```

Le fichier importe déjà `json`, `feedback as F` et `schema as S` (lignes 1 à 8) : garder
l'alias `F`, ne pas en introduire un second.

- [ ] **Step 2 : lancer le test et vérifier qu'il échoue**

Run : `poetry run pytest tests/test_coaching_feedback.py::test_eval_report_splits_cohorts_by_prompt_version -v`
Attendu : ÉCHEC, `KeyError: 'by_prompt_version'`.

- [ ] **Step 3 : implémenter le minimum**

Dans `src/04_coaching/feedback.py`, avant `eval_report` :

```python
def cohort_of(reviews: list[dict]) -> dict[str, str]:
    """ts de review -> cohorte de prompt. Les reviews d'avant le bloc `run`
    n'ont pas de version : elles forment la cohorte "none", qui reste
    identifiable au lieu d'être diluée dans la moyenne."""
    return {r.get("ts"): ((r.get("run") or {}).get("prompt_version") or "none")
            for r in reviews if r.get("ts")}


def filter_cohort(fbs: list[schema_mod.Feedback], reviews: list[dict],
                  version: str) -> list[schema_mod.Feedback]:
    cohorts = cohort_of(reviews)
    return [f for f in fbs if cohorts.get(f.ts) == version]
```

puis dans `eval_report`, après `stats = summarize(fbs)` :

```python
    cohorts = {}
    for version in sorted(set(cohort_of(reviews).values())):
        sub = filter_cohort(fbs, reviews, version)
        sub_obj = objective_stats(sub, reviews)
        sub_stats = summarize(sub)
        cohorts[version] = {
            "n_game_reviews_annotated": sub_obj["n_game_reviews_annotated"],
            "mistake_useful_rate": sub_obj["mistake_useful_rate"],
            "n_items": sub_stats.get("n_items", 0),
            "global_rate": sub_stats.get("global_rate"),
        }
```

et ajouter au dict retourné :

```python
        "by_prompt_version": cohorts,
```

- [ ] **Step 4 : lancer les tests et vérifier qu'ils passent**

Run : `poetry run pytest tests/test_coaching_feedback.py tests/test_eval_parity.py -v`
Attendu : PASS. `test_eval_parity` utilise `set(report) >= {...}`, une clé ajoutée ne le
casse pas ; la Task 3 la verrouille des deux côtés.

- [ ] **Step 5 : brancher le CLI**

Dans `main`, sous-commande `summary`, ajouter l'argument :

```python
    s.add_argument("--prompt-version", default=None,
                   help="restreint à une cohorte de prompt ('none' = sans run)")
```

et dans la branche texte, après `objective = objective_stats(...)` :

```python
        if args.prompt_version:
            reviews = list_reviews(args.player)
            fbs = filter_cohort(fbs, reviews, args.prompt_version)
            objective = objective_stats(fbs, reviews)
```

en plaçant ce bloc **avant** les filtres `--model` et `--tag` existants, pour que l'objectif
affiché soit bien celui de la cohorte.

- [ ] **Step 6 : vérifier sur les données réelles**

Run : `poetry run python3 src/04_coaching/feedback.py summary --player spadzze --prompt-version none`
Attendu : `Objectif par-game : 12/10 reviews annotées · mistakes utiles 96 %`.

Run : `poetry run python3 src/04_coaching/feedback.py summary --player spadzze --json | python3 -c "import json,sys; print(json.load(sys.stdin)['by_prompt_version'])"`
Attendu : une seule cohorte `none` avec `mistake_useful_rate` ≈ 0.964.

- [ ] **Step 7 : commit**

```bash
git add src/04_coaching/feedback.py tests/test_coaching_feedback.py
git commit -m "feat(feedback): cohortes de prompt dans le rapport d'eval"
```

---

### Task 3 : parité de la cohorte côté Worker

**Files :**
- Modify : `web/cf/src/evaluation.ts` (type `EvalReport` ligne ~22 ; `readEval` ligne ~44)
- Modify : `tests/test_eval_parity.py` (les deux listes de champs)

**Interfaces :**
- Consumes : `ReviewRow.run.prompt_version`, déjà déclaré ligne 21 mais **jamais utilisé**.
- Produces : `EvalReport.by_prompt_version`, même forme que la clé Python de la Task 2.

- [ ] **Step 1 : écrire le test qui échoue**

Dans `tests/test_eval_parity.py`, ajouter `"by_prompt_version"` aux deux collections de
`test_both_report_the_same_shape` :

```python
    for field in ("n_game_reviews", "objective", "target_met", "global_rate",
                  "by_kind", "top_tags", "n_reviews_annotated", "n_items",
                  "by_prompt_version"):
        assert f"{field}" in ts, field
    report = fb.eval_report("nobody", root=ROOT / "tests" / "nonexistent")
    assert set(report) >= {"n_game_reviews", "objective", "target_met",
                           "global_rate", "by_kind", "top_tags",
                           "n_reviews_annotated", "n_items",
                           "by_prompt_version"}
```

- [ ] **Step 2 : lancer le test et vérifier qu'il échoue**

Run : `poetry run pytest tests/test_eval_parity.py -v`
Attendu : ÉCHEC sur `assert "by_prompt_version" in ts` (le champ manque côté TS).

- [ ] **Step 3 : implémenter côté TypeScript** (après avoir écrit le test du Step 4 si tu suis TDD strictement : écrire le test TS d'abord, puis revenir ici)

Dans `web/cf/src/evaluation.ts`, ajouter au type :

```typescript
  by_prompt_version: Record<string, {
    n_game_reviews_annotated: number;
    mistake_useful_rate: number | null;
    n_items: number;
    global_rate: number | null;
  }>;
```

et dans `readEval`, avant le `return` :

```typescript
  // Cohorte de prompt : "none" pour les reviews d'avant le bloc `run`. Sans
  // cette coupe, un changement de prompt reste noyé dans la moyenne globale.
  const cohortByTs = new Map<string, string>();
  for (const r of reviews) {
    if (r.ts) cohortByTs.set(r.ts, r.run?.prompt_version ?? "none");
  }
  const byPromptVersion: EvalReport["by_prompt_version"] = {};
  for (const version of [...new Set(cohortByTs.values())].sort()) {
    const subset = feedbacks.filter((f) => f.ts && cohortByTs.get(f.ts) === version);
    const subItems = subset.flatMap((f) => f.items ?? []);
    const subGame = subset.filter((f) => gameTs.has(f.ts));
    const subMistakes = subGame.flatMap((f) => f.items ?? [])
      .filter((it) => it.kind === "mistake");
    byPromptVersion[version] = {
      n_game_reviews_annotated: subGame.length,
      mistake_useful_rate: rate(
        subMistakes.filter((it) => it.useful).length,
        subMistakes.length,
      ),
      n_items: subItems.length,
      global_rate: rate(subItems.filter((it) => it.useful).length, subItems.length),
    };
  }
```

puis ajouter `by_prompt_version: byPromptVersion,` à l'objet retourné.

- [ ] **Step 4 : écrire le test vitest qui échoue**

Ajouter dans `web/cf/test/evaluation.test.ts`, à l'intérieur du `describe("readEval", …)` :

```typescript
  it("sépare les cohortes de prompt, 'none' pour les reviews sans run", async () => {
    const kv = kvWith(
      [
        { ts: "g1", kind: "game" },
        { ts: "g2", kind: "game", run: { prompt_version: "350f7c404b5b" } },
      ],
      [
        { ts: "g1", items: [mistake(false, "trop-vague")] },
        { ts: "g2", items: [mistake(true)] },
      ],
    );
    const report = await readEval(kv, "s");
    expect(report.by_prompt_version["none"].mistake_useful_rate).toBe(0);
    expect(report.by_prompt_version["350f7c404b5b"].mistake_useful_rate).toBe(1);
    expect(report.by_prompt_version["none"].n_game_reviews_annotated).toBe(1);
    expect(report.objective.mistake_useful_rate).toBe(0.5);   // toutes cohortes
  });
```

Run : `cd web/cf && npm test`
Attendu : ÉCHEC, `by_prompt_version` est `undefined`.

- [ ] **Step 5 : lancer les deux suites et vérifier qu'elles passent**

Run : `cd web/cf && npm test && npm run typecheck`
Attendu : PASS des deux (les autres tests de `test/evaluation.test.ts` restent verts, ils ne
figent pas la forme exhaustive du rapport).

Run : `poetry run pytest tests/test_eval_parity.py -v`
Attendu : PASS.

- [ ] **Step 6 : commit**

```bash
git add web/cf/src/evaluation.ts web/cf/test/evaluation.test.ts tests/test_eval_parity.py
git commit -m "feat(web): cohortes de prompt dans l'eval servi, verrouillees par parite"
```

---

### Task 4 : générer le lot frais de reviews par-partie

**Files :** aucun fichier de code. Écrit `data/07_coaching/spadzze/reviews.jsonl` (gitignoré).

**Interfaces :**
- Consumes : `coach.run_batch` via le CLI ; le silver perso et le raw compressé.
- Produces : 10 nouveaux records `kind: "game"` portant `run.prompt_version = 350f7c404b5b`.

- [ ] **Step 1 : figer le compte avant génération**

```bash
wc -l data/07_coaching/spadzze/reviews.jsonl
```
Attendu : `17`. Noter ce nombre, il sert de contrôle à l'étape 3.

- [ ] **Step 2 : générer le lot**

```bash
poetry run python3 src/04_coaching/coach.py --player spadzze --game-batch 10
```
Attendu : 10 lignes `✓ EUW1_… reviewée`, puis `Bilan : 10 générée(s) · 0 déjà reviewée · 0 échouée`.
Chaque génération affiche une ligne `Run : prompt 350f7c404b5b · … s · … tokens`.

Si des games échouent (`✗`), le bilan le dit et le brut est dans
`data/07_coaching/spadzze/failed/`. Relancer la commande complète le lot : `--game-batch`
ne resélectionne que les parties non reviewées, il n'y a rien à dédupliquer à la main. 38
parties ADC sont disponibles, la marge est large.

- [ ] **Step 3 : vérifier la cohorte et la télémétrie**

```bash
poetry run python3 -c "
import json, collections
rows = [json.loads(l) for l in open('data/07_coaching/spadzze/reviews.jsonl')]
print('total', len(rows))
c = collections.Counter((r.get('kind'), (r.get('run') or {}).get('prompt_version')) for r in rows)
for k, v in c.items(): print(v, k)
neuf = [r for r in rows if (r.get('run') or {}).get('prompt_version')]
print('sans latence :', sum(1 for r in neuf if r['run'].get('latency_ms') is None))
print('sans tokens  :', sum(1 for r in neuf if r['run'].get('total_tokens') is None))
print('retries      :', sum(r['run'].get('schema_retries') or 0 for r in neuf))
"
```
Attendu : `total 27` ; 12 en `('game', None)`, 10 en `('game', '350f7c404b5b')` ; 0 record
neuf sans latence ni tokens. Un `prompt_version` différent de `350f7c404b5b` signifie que le
prompt a bougé pendant le lot : arrêter et repartir d'un prompt figé.

- [ ] **Step 4 : ne rien committer**

`data/` est gitignoré. Vérifier que rien n'a fui :

```bash
git status --short
```
Attendu : aucune entrée sous `data/`.

---

### Task 5 : évaluation automatique avant toute annotation humaine

**Files :** aucun fichier de code. Écrit `data/07_coaching/spadzze/eval/` (gitignoré).

**Interfaces :** consomme les filtres de cohorte des Tasks 1 et 2.

- [ ] **Step 1 : ancrage de la cohorte fraîche**

```bash
poetry run python3 src/04_coaching/grounding.py --player spadzze --kind game \
  --prompt-version 350f7c404b5b --details
```
Portes, comparées à la baseline cohorte A du tableau d'état :
- `grounded_rate` ≥ 0,95 (A : 0,986) ;
- `anchored_rate` des horloges ≥ 0,98 (A : 1,00) ;
- **violations d'asymétrie = 0** (A : 0). Toute violation est bloquante : elle contredit le
  principe directeur n°2 et se corrige dans `prompt.SYSTEM_GAME` avant d'annoter.

Le mode `--details` liste les chiffres non ancrés. Les inspecter un par un : un nombre non
ancré peut être une vraie hallucination, ou une unité que `grounding` ne cloisonne pas encore
(les dégâts `dmg` sont récents). Dans le second cas, le défaut est dans le vérificateur, pas
dans le modèle : le noter pour la Task 8, ne pas le compter comme hallucination.

- [ ] **Step 2 : sensibilité au payload**

```bash
poetry run python3 src/04_coaching/counterfactual.py --player spadzze --n 3 --json \
  > /tmp/cf_$(date +%Y%m%d).json
poetry run python3 -c "
import json, glob
d = json.load(open(sorted(glob.glob('/tmp/cf_*.json'))[-1]))
print(json.dumps(d, ensure_ascii=False, indent=1)[:3000])
"
```
Attendu, une attente par perturbation (elles sont documentées en tête de
`counterfactual.py`) :
- `no_deaths` : la `confidence` baisse par rapport à la baseline ;
- `zone_to_top` : les morts citées basculent en TOP ;
- `unspent_gold_zero` : le gold non dépensé cité s'effondre.

Coût : 3 games × (1 baseline + 3 perturbations). Vérifier ensuite que les sorties
contrefactuelles sont bien dans `data/07_coaching/spadzze/eval/` et **absentes** de
`reviews.jsonl` (ce ne sont pas des reviews du joueur) :

```bash
ls data/07_coaching/spadzze/eval/ && wc -l data/07_coaching/spadzze/reviews.jsonl
```
Attendu : le dossier `eval/` contient les sorties, `reviews.jsonl` reste à 27 lignes.

- [ ] **Step 3 : décider avant d'annoter**

Si une perturbation ne suit pas, le coach récite au lieu de lire : c'est un défaut de prompt
ou de payload, et annoter à la main 10 reviews issues d'un modèle insensible gaspille le seul
annotateur disponible. Dans ce cas, corriger, régénérer le lot (Task 4) et refaire cette
tâche. Sinon, passer à la Task 6.

---

### Task 6 : annoter le lot frais et comparer les cohortes

**Files :** aucun fichier de code. Écrit `data/07_coaching/spadzze/feedback.jsonl` (gitignoré).

**Interfaces :** consomme `feedback.py annotate --pending` (existant) et les cohortes de la
Task 2.

- [ ] **Step 1 : annoter en série**

```bash
poetry run python3 src/04_coaching/feedback.py annotate --player spadzze --pending
```
`--pending` itère toutes les reviews sans feedback, les plus anciennes d'abord. Une review
entièrement passée (`s`) n'est pas persistée et reste pending : c'est voulu, mais cela ne
compte pas dans l'objectif. Viser les 10 reviews du lot.

Consigne d'annotation, à tenir pour que la comparaison signifie quelque chose : juger
l'**utilité** de l'item tel qu'il est écrit, sans crédit d'intention, et poser un `note` en
texte libre sur chaque item jugé faux. Ce sont ces verbatims qui ont produit les itérations
`cause` et matchup ; un tag sans note ne dit pas quoi corriger.

- [ ] **Step 2 : lire les deux cohortes côte à côte**

```bash
poetry run python3 src/04_coaching/feedback.py summary --player spadzze --json \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for version, s in d['by_prompt_version'].items():
    r = s['mistake_useful_rate']
    g = s['global_rate']
    print(f\"{version:14} n_game={s['n_game_reviews_annotated']:2} \"
          f\"mistakes={'--' if r is None else format(r, '.1%'):>6} \"
          f\"global={'--' if g is None else format(g, '.1%'):>6} \"
          f\"items={s['n_items']}\")
print('objectif global :', d['objective'], '| atteint :', d['target_met'])
"
```
Attendu : deux lignes, `none` (12 reviews, 96,4 %) et `350f7c404b5b` (10 reviews, taux à
mesurer). Le critère produit reste **≥70 % de mistakes utiles sur ≥10 reviews par-partie**,
et il doit être atteint **dans la cohorte fraîche seule**, pas seulement en cumul.

- [ ] **Step 3 : lire les sections et les tags, pas seulement le taux**

```bash
poetry run python3 src/04_coaching/feedback.py summary --player spadzze --prompt-version 350f7c404b5b
poetry run python3 src/04_coaching/feedback.py summary --player spadzze --prompt-version none
```
Le signal utile est là : cohorte A avait **forces à 72,7 %** pour des erreurs à 93,0 %, et
les tags dominants étaient `non-actionnable` (×6) et `trop-vague` (×4), presque tous sur les
reviews **agrégées**. Comparer par section et par tag, et écrire une conclusion en une phrase
par section.

- [ ] **Step 4 : formuler le verdict avec sa limite**

Rédiger 5 à 10 lignes qui disent, dans l'ordre : le taux de la cohorte fraîche avec son n, la
comparaison par section, les tags résiduels, et **la limite de causalité** : games, payload et
prompt ont changé ensemble, donc l'écart entre cohortes est une comparaison de deux cohortes
observées, pas un A/B. Un seul annotateur, qui est l'auteur : c'est une mesure, pas une
validation externe. Ce texte est réutilisé tel quel en Task 8.

---

### Task 7 (conditionnelle) : A/B automatisé de modèles

**Déclencheur :** ne lancer cette tâche que si la Task 6 laisse un doute sur le **modèle**
(par exemple mistakes utiles sous 70 %, ou retries de schéma récurrents en Task 4). Si le
verdict est bon, le choix `kimi-k2.6` n'a pas à être rouvert : le sauter et le dire.

**Files :** écrit `data/07_coaching/spadzze/eval/` (gitignoré).

- [ ] **Step 1 : répétition à blanc**

```bash
poetry run python3 src/04_coaching/model_ab.py --player spadzze --n 3 --dry-run
```
Attendu : le plan d'appels (modèles, games, perturbations), sans appel réseau.

- [ ] **Step 2 : lancer l'A/B**

```bash
poetry run python3 src/04_coaching/model_ab.py --player spadzze --n 3 --json \
  > data/07_coaching/spadzze/eval/model_ab.json
```
Modèles par défaut : `kimi-k2.6` contre `glm-5.3` (`model_ab.py:25`). Chaque modèle
régénère **sa propre baseline** avant les perturbations, sinon le test `no_deaths` serait
faussé : ne pas court-circuiter cette étape pour économiser des appels.

- [ ] **Step 3 : comparer sur les quatre axes**

Lire `model_ab.json` et comparer ancrage, sensibilité contrefactuelle, conformité de schéma
(retries) et latence. Ne changer le défaut de `coach.py:35` que si un modèle gagne sur
l'ancrage **et** la sensibilité ; la latence seule ne justifie pas un changement, et la thèse
du projet (« la qualité vient du prompt et des features, pas du modèle ») demande une preuve
avant d'être contredite.

---

### Task 8 : consigner et publier le résultat

**Files :**
- Modify : `docs/MODEL_CARD.md` (§ 10 « Évaluation de la couche LLM », ligne ~193)
- Modify : `todo.md` (§ Priorité 0)
- Modify : `CLAUDE.md` (§ État d'avancement, via la compétence dédiée)

- [ ] **Step 1 : mettre à jour la model card**

Dans `docs/MODEL_CARD.md` § 10, remplacer la mesure unique par les deux cohortes : ancienne
(12 analyses, 96,4 %, prompt non tracé) et nouvelle (n et taux mesurés, prompt
`350f7c404b5b`), avec les taux d'ancrage des deux et la phrase de limite rédigée en Task 6.
Ne pas supprimer l'ancien chiffre : une model card garde son historique de mesure.

- [ ] **Step 2 : cocher la Priorité 0 dans `todo.md`**

Cocher les cases réalisées, et pour l'A/B : soit cochée avec son verdict, soit explicitement
marquée « non ouverte, le modèle n'était pas en cause ». Reporter en Priorité 3 tout défaut
de `grounding` repéré en Task 5 (unité non cloisonnée), avec le chiffre observé.

- [ ] **Step 3 : commit du code et des docs**

```bash
git add docs/MODEL_CARD.md todo.md
git commit -m "docs(eval): deux cohortes de prompt mesurees sur le coach par-partie"
```

- [ ] **Step 4 : publier vers KV**

```bash
poetry run python3 src/collection/sync_cloudflare.py --push-coaching --dry-run
poetry run python3 src/collection/sync_cloudflare.py --push-coaching
```
La fusion se fait par `ts` et n'écrase jamais une ligne écrite depuis le site. Le champ
`by_prompt_version` n'apparaît en ligne qu'une fois le Worker redéployé
(`cd web/cf && npm run deploy`) : le déploiement est une action sortante, demander l'accord
de Jean avant de la lancer. Vérifier ensuite que le site recalcule bien le taux à la lecture :

```bash
curl -s https://coaching-lol.jeanvg.fr/api/c/spadzze/eval | python3 -m json.tool | head -40
```
Attendu : `by_prompt_version` présent (Task 3 déployée) avec les deux cohortes, et
`target_met` cohérent avec la sortie locale de la Task 6.

- [ ] **Step 5 : mettre CLAUDE.md à jour**

Invoquer la compétence `commit-sync-claudemd` pour refléter dans `CLAUDE.md`
§ « État d'avancement » la nouvelle mesure et la dimension cohorte des deux rapports.

- [ ] **Step 6 : suite complète avant de clore**

```bash
poetry run pytest tests/
poetry run make demo
```
Attendu : tout vert. `make demo` rejoue la chaîne de production sur les fixtures
pseudonymisées, dont `grounding` : c'est le contrôle que les Tasks 1 à 3 n'ont pas cassé le
chemin sans réseau.
