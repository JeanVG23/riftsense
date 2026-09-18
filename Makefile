# Makefile : points d'entrée du projet ET graphe réel du pipeline.
#
# Deux usages distincts :
#
#   `make demo`      rend le dépôt exécutable après un simple clone (0 réseau, 0 clé).
#   `make pipeline`  rejoue la chaîne de production sur `data/`, en ne recalculant
#                    que ce qui est périmé.
#
# Le second point est ce qui remplace l'ancienne boucle `for i in {1..5}; sleep 10`.
# Les dépendances déclarées ci-dessous sont les VRAIES : chaque étape dépend des
# artefacts qu'elle lit ET du code qui la produit. Ajouter une feature dans
# `src/core/positioning.py` périme le silver, donc le gold, donc les datasets, donc
# les modèles. Sans ça, on sert un modèle entraîné sur des features qui n'existent
# plus, et rien ne le signale.
#
# `make plan` affiche ce qui serait relancé, sans rien lancer.

SHELL := /bin/bash
PY := poetry run python3

# `DATA` et `COACHING_DATA_DIR` désignent la même chose : la racine de la pile
# médaillon. On l'exporte pour que `make gold DATA=.demo` déplace RÉELLEMENT les
# scripts, qui lisent l'environnement et pas les variables de make.
DATA    ?= $(or $(COACHING_DATA_DIR),data)
export COACHING_DATA_DIR := $(abspath $(DATA))
STAMPS  := $(DATA)/.stamps
RAW_DIR := $(DATA)/01_raw
DATASET := $(DATA)/04_dataset
MODEL   := $(DATA)/05_model
SHAP    := $(DATA)/06_shap

# Le code partagé périme tout l'aval : `riotlib` change le silver, `ml_features`
# change les datasets. On dépend du dossier entier plutôt que d'entretenir une
# liste par étape, qui se serait désynchronisée au premier import ajouté.
CORE := $(wildcard src/core/*.py)

DEMO_DIR ?= .demo
FIXTURES := tests/fixtures/demo
DEMO_ENV := COACHING_DATA_DIR=$(abspath $(DEMO_DIR))

# Collecte : paramètres de l'ancien run_scraping.sh, désormais surchargeables.
REGION  ?= euw1
RANKS   ?= challenger,grandmaster,master,diamond
PLAYERS ?= 150
GAMES   ?= 5
ROUNDS  ?= 5
PAUSE   ?= 10

# Chaîne par rôle. Le label de rang ne vient plus du dossier silver mais d'un
# snapshot DATÉ du ladder : make doit donc dépendre d'un fichier précis, pas d'un
# « dernier en date » implicite. On lit le jour le plus récent MARQUÉ COMPLET dans
# le manifeste (un blob à demi écrit existe sur disque sans être lisible), et une
# nouvelle capture périme mécaniquement les cinq datasets, ce qui est le but.
ROLES_LC ?= top jungle middle bottom support
PLATFORM ?= $(REGION)
LADDER_DIR := $(RAW_DIR)/rank_snapshots/$(PLATFORM)
SNAPSHOT_DAY ?= $(shell python3 -c "import json,pathlib; p=pathlib.Path('$(LADDER_DIR)/manifest.json'); m=json.loads(p.read_text()) if p.exists() else {}; print(max((d for d, v in m.items() if v.get('complete')), default=''))" 2>/dev/null)
LADDER := $(LADDER_DIR)/$(SNAPSHOT_DAY).jsonl.zst

ROLE_GAMES   := $(foreach role,$(ROLES_LC),$(DATASET)/$(role)_dataset.parquet)
ROLE_WINDOWS := $(foreach role,$(ROLES_LC),$(DATASET)/$(role)_player_dataset.parquet)
ROLE_METRICS := $(foreach role,$(ROLES_LC),$(MODEL)/$(role)_player_metrics.json)
ROLE_EXPORTS := $(foreach role,$(ROLES_LC),$(MODEL)/$(role)_ebm_export.json)

.PHONY: help demo demo-clean test lint fixtures generate-shared \
        pipeline plan silver gold dataset split models analyse report \
        roles verify-exports collect lp-label ladder sync sync-push graph force

help:
	@echo "Démo (0 réseau, 0 clé)"
	@echo "  make demo      pipeline complet sur les fixtures versionnées"
	@echo ""
	@echo "Pipeline de production (data/ local)"
	@echo "  make plan      ce qui est périmé et serait relancé (ne lance rien)"
	@echo "  make pipeline  silver -> gold -> datasets -> split -> modèles -> analyse -> rôles"
	@echo "  make silver | gold | dataset | split | models | analyse | report"
	@echo "  make roles     datasets + modèles par rôle -> table d'ouverture"
	@echo "  make graph     le graphe de dépendances"
	@echo ""
	@echo "Étapes réseau (jamais déclenchées automatiquement)"
	@echo "  make collect   collecte Riot (RANKS/PLAYERS/GAMES/ROUNDS/REGION)"
	@echo "  make lp-label  LP courant des tiers apex (label de la régression)"
	@echo "  make ladder    snapshot daté du ladder (label de rang par rôle)"
	@echo "  make sync      publication Cloudflare KV en dry-run"
	@echo "  make sync-push publication réelle"
	@echo ""
	@echo "Qualité"
	@echo "  make test      pytest + vitest"
	@echo "  make lint      ruff + typecheck TypeScript"
	@echo "  make fixtures  régénère tests/fixtures/demo depuis les données locales"
	@echo "  make generate-shared  prompts + schemas partages -> Worker"

# ---------------------------------------------------------------- démo ---------

demo: demo-clean
	@echo "\n=== 0/5  Jeu de démo : 49 parties réelles pseudonymisées ==="
	@mkdir -p $(DEMO_DIR)
	@cp -R $(FIXTURES)/. $(DEMO_DIR)/
	@cat $(FIXTURES)/MANIFEST.json
	@echo "\n=== 1/5  Silver : ré-extraction depuis le raw (0 appel API) ==="
	@$(DEMO_ENV) $(PY) src/pipeline_ops/reextract_silver.py
	@echo "\n=== 2/5  Gold : agrégats benchmarkés (facettes win/loss) ==="
	@$(DEMO_ENV) $(PY) src/pipeline_ops/rebuild_gold.py
	@echo "\n=== 3/5  Verdict heuristique : perso vs challenger, à issue égale ==="
	@$(DEMO_ENV) $(PY) src/reporting/compare.py --scope adc --outcome loss
	@echo "\n=== 4/5  Coaching : payload -> schéma -> review (modèle bouchonné) ==="
	@$(DEMO_ENV) $(PY) src/04_coaching/coach.py --scope adc --game --mock-llm
	@echo "\n=== 5/5  Évaluation automatique : ancrage de la review produite ==="
	@$(DEMO_ENV) $(PY) src/04_coaching/grounding.py --player spadzze
	@echo "\nDonnées de la démo dans $(DEMO_DIR)/ (jetable). Vos données réelles"
	@echo "vivent dans data/ et n'ont pas été touchées."

demo-clean:
	@rm -rf $(DEMO_DIR)

# ------------------------------------------------------------- pipeline --------

pipeline: models gold analyse roles
	@echo "\n✓ Pipeline à jour."

# `make -n` sur le graphe réel : la seule façon honnête de répondre à « qu'est-ce
# qui est périmé ? », puisque c'est make lui-même qui répond.
#
# `-o force` : le témoin raw dépend de la cible bidon `force` (sans recette) pour être
# réévalué à chaque invocation. En mode -n, make ne PEUT PAS exécuter le `find` de la
# recette du témoin : il suppose donc le stamp refait et cascade tout l'aval, si bien
# que `make plan` ne revenait jamais propre. Traiter `force` comme à jour lève ce faux
# positif, mais aveugle du même coup le seul capteur de fraîcheur du raw : la 1re ligne
# rejoue explicitement le MÊME test `find` que la recette, sinon on échangerait un faux
# positif permanent contre un faux négatif silencieux.
plan:
	@if [ -e $(STAMPS)/raw ] && [ -n "$$(find $(RAW_DIR) -newer $(STAMPS)/raw -print -quit 2>/dev/null)" ]; then \
	  echo "  ⚠ 01_raw plus récent que le témoin : tout l'aval est périmé (make pipeline)."; fi
	@$(MAKE) --no-print-directory -n -o force pipeline \
	  | grep -E '^[[:space:]]*poetry run' \
	  || echo "  ✓ rien à recalculer, tout l'aval est à jour."

$(STAMPS):
	@mkdir -p $@

# Le raw grossit hors de make (collecte, densification, scripts ad hoc). On ne
# peut donc pas s'en remettre à une date de fichier connue : on vérifie à chaque
# invocation s'il existe un fichier plus récent que le témoin, et `-quit` arrête
# le parcours au premier trouvé. C'est le seul point du graphe où l'amont n'est
# pas produit par make.
$(STAMPS)/raw: force | $(STAMPS)
	@if [ ! -e $@ ] || [ -n "$$(find $(RAW_DIR) -newer $@ -print -quit 2>/dev/null)" ]; then \
	  touch $@; fi

force:

silver: $(STAMPS)/silver
$(STAMPS)/silver: $(STAMPS)/raw src/pipeline_ops/reextract_silver.py $(CORE) | $(STAMPS)
	$(PY) src/pipeline_ops/reextract_silver.py
	@touch $@

gold: $(STAMPS)/gold
$(STAMPS)/gold: $(STAMPS)/silver src/pipeline_ops/rebuild_gold.py $(CORE) | $(STAMPS)
	$(PY) src/pipeline_ops/rebuild_gold.py
	@touch $@

dataset: $(DATASET)/adc_dataset.parquet $(DATASET)/adc_player_dataset.parquet
$(DATASET)/adc_dataset.parquet: $(STAMPS)/silver src/01_data_engineering/build_dataset.py $(CORE)
	$(PY) src/01_data_engineering/build_dataset.py

$(DATASET)/adc_player_dataset.parquet: $(DATASET)/adc_dataset.parquet \
                                       src/01_data_engineering/build_player_dataset.py $(CORE)
	$(PY) src/01_data_engineering/build_player_dataset.py

# Le label LP vient d'un appel API horodaté : il n'a pas sa place dans une chaîne
# hors-ligne. S'il manque, on le dit au lieu de laisser make répondre
# « No rule to make target ».
$(DATASET)/apex_lp.json:
	@echo "✗ $@ absent : label LP jamais collecté. Lance 'make lp-label' (API Riot)." >&2
	@exit 1

$(DATASET)/adc_player_lp_dataset.parquet: $(DATASET)/adc_dataset.parquet $(DATASET)/apex_lp.json \
                                          src/01_data_engineering/build_player_lp_dataset.py $(CORE)
	$(PY) src/01_data_engineering/build_player_lp_dataset.py

# Le split lit le dataset LP quand il existe (union des deux populations), et s'en
# passe sinon : `wildcard` reproduit exactement le `if LP_DATASET.exists()` du script.
split: $(DATASET)/split.json
$(DATASET)/split.json: $(DATASET)/adc_player_dataset.parquet \
                       $(wildcard $(DATASET)/adc_player_lp_dataset.parquet) \
                       src/01_data_engineering/build_split.py $(CORE)
	$(PY) src/01_data_engineering/build_split.py

models: $(MODEL)/player_rank_calibration.json $(MODEL)/player_lp_metrics.json

$(MODEL)/player_metrics.json: $(DATASET)/adc_player_dataset.parquet $(DATASET)/adc_dataset.parquet \
                              $(DATASET)/split.json src/02_data_science/train_player_ensemble.py \
                              src/02_data_science/cv_common.py $(CORE)
	$(PY) src/02_data_science/train_player_ensemble.py

# La calibration lit les OOF du train exportés par l'entraînement : elle dépend du
# modèle, pas du dataset.
$(MODEL)/player_rank_calibration.json: $(MODEL)/player_metrics.json \
                                       src/02_data_science/calibrate_player_rank.py $(CORE)
	$(PY) src/02_data_science/calibrate_player_rank.py

$(MODEL)/player_lp_metrics.json: $(DATASET)/adc_player_lp_dataset.parquet $(DATASET)/split.json \
                                 src/02_data_science/train_player_lp.py \
                                 src/02_data_science/cv_common.py $(CORE)
	$(PY) src/02_data_science/train_player_lp.py

# Modèle d'explication du jeu-type (dia_chall) : re-entraîné dans le DAG pour
# l'analyse EBM glass-box (seuils de bascule in-game), JAMAIS servi pour le rang
# (le rang = per-player, cf. src/core/ml_rank.py). metrics_dia_chall.json = stamp
# des {xgb,rf,ebm}_dia_chall.pkl écrits par le même run.
$(MODEL)/metrics_dia_chall.json: $(DATASET)/adc_dataset.parquet \
                                 src/02_data_science/train_ensemble.py $(CORE)
	$(PY) src/02_data_science/train_ensemble.py --target dia_chall

# Analyse EBM glass-box unifiée (moteur : src/core/ebm_explain.py, CLI fine :
# shap_analysis.py). ebm_shape_functions.json = stamp-of-record de TOUTES les
# sorties du niveau : un seul run les écrit ensemble.
$(SHAP)/player/high_elo/ebm_shape_functions.json: $(MODEL)/player_metrics.json \
        $(DATASET)/adc_player_dataset.parquet src/03_data_analyse/shap_analysis.py $(CORE)
	$(PY) src/03_data_analyse/shap_analysis.py --level player

$(SHAP)/game/dia_chall/ebm_shape_functions.json: $(MODEL)/metrics_dia_chall.json \
        $(DATASET)/adc_dataset.parquet src/03_data_analyse/shap_analysis.py $(CORE)
	$(PY) src/03_data_analyse/shap_analysis.py --level game

analyse: $(SHAP)/player/high_elo/ebm_shape_functions.json $(SHAP)/game/dia_chall/ebm_shape_functions.json

# ------------------------------------------------------------- par rôle -------
#
# Même graphe que la chaîne ADC, mais cinq fois, et avec une différence de fond :
# le label n'est plus le rang du dossier silver (rang de COLLECTE, transféré à
# tout le lobby), c'est le snapshot daté du ladder. D'où la dépendance à
# `$(LADDER)`, qui vient du réseau et n'est donc jamais produite par le graphe.
#
# Règles à motif STATIQUES : le motif ne s'applique qu'aux cibles listées, si bien
# que `adc_dataset.parquet` et `player_metrics.json`, qui matcheraient tous les
# deux, gardent leurs règles explicites.

# Un snapshot manquant doit nommer la commande à lancer. Sans cette règle, make
# répond « No rule to make target », ce qui n'apprend rien à qui découvre la chaîne.
$(LADDER):
	@echo "✗ $@ absent : aucun snapshot complet du ladder. Lance 'make ladder' (API Riot)." >&2
	@exit 1

$(ROLE_GAMES): $(DATASET)/%_dataset.parquet: $(STAMPS)/silver \
               src/01_data_engineering/build_dataset.py $(CORE)
	$(PY) src/01_data_engineering/build_dataset.py --role $*

$(ROLE_WINDOWS): $(DATASET)/%_player_dataset.parquet: $(DATASET)/%_dataset.parquet \
                 $(LADDER) src/01_data_engineering/build_role_player_dataset.py $(CORE)
	$(PY) src/01_data_engineering/build_role_player_dataset.py --role $* --platform $(PLATFORM) --snapshot-day $(SNAPSHOT_DAY)

$(ROLE_METRICS): $(MODEL)/%_player_metrics.json: $(DATASET)/%_player_dataset.parquet \
                 $(DATASET)/%_dataset.parquet src/02_data_science/train_role_ensemble.py \
                 $(CORE)
	$(PY) src/02_data_science/train_role_ensemble.py --role $*

# L'export est le seul artefact de modèle qui parte en production. Le supprimer
# doit donc relancer l'entraînement du rôle. L'export est écrit en dernier par
# save_role_artifacts, ce qui évite une relance à chaque passage avec Make 3.81.
$(ROLE_EXPORTS): $(MODEL)/%_ebm_export.json: $(MODEL)/%_player_metrics.json
	$(PY) src/02_data_science/train_role_ensemble.py --role $*

# La table d'ouverture relit les cinq métriques : elle dépend des cinq, sinon
# elle publierait une marge calculée sur un modèle et une autre sur un modèle
# d'avant-hier, sans que rien ne les distingue.
$(MODEL)/role_readiness.json: $(ROLE_METRICS) $(ROLE_EXPORTS) src/pipeline_ops/role_readiness.py $(CORE)
	$(PY) src/pipeline_ops/role_readiness.py

roles: $(MODEL)/role_readiness.json

verify-exports:
	@$(PY) src/pipeline_ops/verify_exports.py

report:
	@$(PY) src/pipeline_ops/dataset_report.py

# Lit une variable du graphe sans la recopier ailleurs : `make print-LADDER`.
# Les tests s'en servent pour verrouiller ce qu'une expansion vide rendrait
# invisible (une plateforme absente fabrique un chemin plausible et faux).
print-%:
	@echo '$($*)'

graph:
	@echo "  01_raw (collecte Riot, hors make)"
	@echo "    └─ reextract_silver ──> 02_silver"
	@echo "         ├─ rebuild_gold ──> 03_gold ──> compare / payload coaching"
	@echo "         └─ build_dataset ──> adc_dataset.parquet"
	@echo "              ├─ build_player_dataset ──> adc_player_dataset.parquet"
	@echo "              ├─ train_ensemble (dia_chall) ──> *_dia_chall.pkl (modèle d'explication du jeu-type, jamais servi)"
	@echo "              │    └─ shap_analysis --level game ──> 06_shap/game/dia_chall/"
	@echo "              └─ build_player_lp_dataset ──> adc_player_lp_dataset.parquet"
	@echo "                   (+ apex_lp.json, 'make lp-label')"
	@echo "                        └─ build_split ──> split.json"
	@echo "                             ├─ train_player_ensemble ──> *_player_highelo.pkl"
	@echo "                             │    ├─ calibrate_player_rank ──> calibration"
	@echo "                             │    └─ shap_analysis --level player ──> 06_shap/player/high_elo/"
	@echo "                             └─ train_player_lp ──> *_player_lp.pkl"
	@echo "                                  └─ sync_cloudflare ──> KV (manuel)"
	@echo ""
	@echo "  chaîne par rôle (label = snapshot daté du ladder, 'make ladder')"
	@echo "    02_silver ──> build_dataset --role X ──> <x>_dataset.parquet"
	@echo "         └─ build_role_player_dataset --role X (+ snapshot ladder)"
	@echo "              ──> <x>_player_dataset.parquet (+ .meta.json de provenance)"
	@echo "                   └─ train_role_ensemble --role X ──> <x>_player_metrics.json"
	@echo "                        └─ role_readiness (×5) ──> role_readiness.json"

# --------------------------------------------------------------- réseau --------

# Remplace run_scraping.sh / run_uniform_scraping.sh : mêmes appels, mais les
# paramètres sont des variables et non des constantes recopiées dans deux fichiers.
# La pause entre passes est une politesse envers l'API, pas un ordonnancement :
# le rate-limiter vit dans riotlib.
collect:
	@for i in $$(seq 1 $(ROUNDS)); do \
	  echo "→ passe $$i/$(ROUNDS) : $(RANKS) ($(PLAYERS) joueurs × $(GAMES) games)"; \
	  $(PY) src/collection/build_referential.py --region $(REGION) --rank $(RANKS) \
	    --players $(PLAYERS) --games $(GAMES) --skip-known --start-page 0 || exit 1; \
	  [ $$i -lt $(ROUNDS) ] && sleep $(PAUSE); \
	done; \
	echo "✓ collecte terminée. 'make pipeline' pour propager."

lp-label:
	$(PY) src/collection/fetch_apex_lp.py --region $(REGION)

# Une capture par jour, écrite puis marquée complète dans le manifeste. Relancer
# cette cible périme les cinq datasets par rôle : c'est voulu, le label a changé.
ladder:
	$(PY) src/collection/fetch_ladder.py --platform $(PLATFORM)

sync:
	@echo "→ payloads unitaires reconstruits depuis le cache raw local (0 appel Riot)"
	$(PY) src/collection/sync_cloudflare.py --dry-run --push-coaching

sync-push:
	@echo "→ payloads unitaires reconstruits depuis le cache raw local (0 appel Riot)"
	$(PY) src/collection/sync_cloudflare.py --push-coaching

# -------------------------------------------------------------- qualité --------

# Régénération des fixtures : nécessite le cache raw local, donc réservée au
# poste qui collecte. L'audit de pseudonymisation tourne à la fin.
fixtures:
	@$(PY) src/pipeline_ops/build_demo_fixtures.py

# Prompts + schémas partagés (0 réseau, 0 API, idempotent) : source de vérité pour
# les deux runtimes. À relancer après toute modification de shared/prompts/*.txt ou
# de src/04_coaching/schema.py.
generate-shared:
	@$(PY) src/pipeline_ops/generate_shared.py

test:
	@$(PY) -m pytest tests/ -q
	@npm test --prefix web/cf

lint:
	@poetry run ruff check .
	@npm run --prefix web/cf typecheck
