# Historique détaillé — État d'avancement

> Journal chronologique des runs ML, décisions et métriques du projet RiftSense.
> Extrait de CLAUDE.md le 2026-09-16 pour respecter la limite de taille du fichier.
> Résumé actif (à jour) : voir la section « État d'avancement » de `CLAUDE.md`.


- **Chaîne par rôle, labellisée par snapshot du ladder** 🚧 (2026-09-18) : cinq
  modèles per-player (TOP/JUNGLE/MIDDLE/BOTTOM/SUPPORT), entraînés sur les seules
  features publiables, destinés à devenir l'analyse ML publique. Le label vient d'un
  snapshot DATÉ du ladder (`fetch_ladder.py`, `make ladder`) et non plus du rang de
  collecte du dossier silver : c'est la sortie du flaw assumé de transfert de rang.
  Fenêtres à profondeur FIXE `(puuid, role, as_of)`, N=20, sinon le volume
  d'historique collecté proxie le rang via les statistiques de dispersion.
  Effectifs et held-out (snapshot euw1 du 2026-09-17, purged CV, EBM
  `interactions=0`) : TOP 728 fenêtres / 0.7092, JUNGLE 922 / 0.7251, MIDDLE 939 /
  0.7144, BOTTOM 1089 / 0.8569, SUPPORT 826 / 0.7296. Les cinq rôles restent FERMÉS
  (`corpus: "research"`), y compris BOTTOM dont la marge est pourtant positive
  (+0.1007) : l'ouverture exige une certification écrite à la main.
  - **Borne d'âge du label retirée** : la règle des 14 jours venait du rythme des
    patchs LoL, pas de la donnée, et la tenir imposait de recollecter tout le corpus
    à chaque capture. Remplacée par de la mesure : `label_age_days` par ligne, sidecar
    `.meta.json` de provenance à côté de chaque dataset, report dans les métriques,
    colonne « âge label » dans la table d'ouverture (82 jours, 84 pour TOP).
  - **`win_rate` ajouté aux features par rôle** (il était calculé mais vu par aucun
    modèle, alors que l'ADC servi l'utilise). Ablation sur corpus identique :
    CV médiane -0.0005, held-out médiane +0.005 avec 4 rôles sur 5 positifs, pour une
    erreur-type de 0.056 à 0.099. Statistiquement un match nul : gardé pour la raison
    conceptuelle (comparable à N fixe, sépare la variance de résultat de la
    performance), pas pour un gain mesuré. L'ablation montre aussi que la baisse de
    MIDDLE et BOTTOM vient du nouveau snapshot, pas de la feature.
  - **Repli sur `utility_player_metrics.json` supprimé** dans `role_readiness` :
    servir l'AUC d'un modèle non régénérable sous le nom d'un autre. Les replis sur
    les DATASETS restent (retrouver une entrée sous son ancien nom est bénin).
  - **Câblée dans le `Makefile`** (`make roles`, inclus dans `make pipeline`) : le
    snapshot est une dépendance fichier (jour le plus récent marqué complet), donc une
    nouvelle capture périme les cinq datasets et `make plan` le dit.

- **Analyse ML unifiée (EBM glass-box)** ✅ (2026-09-08) : un moteur unique
  (`core/ebm_explain.py`, registre `LEVELS` player/game) sert l'analyse des deux niveaux
  ET la chaîne aval. `make analyse` (dans `make pipeline`) écrit
  `06_shap/{player/high_elo,game/dia_chall}/`. Le sync publie la décomposition exacte
  per-player sous `shap:{slug}:drivers` (champ `contribution`, array JSON nu, clé
  inchangée : le Worker ne bouge pas) et l'onglet « Analyse ML » du site affiche les
  contributions EBM. Le rang servi reste xgb+rf ; les drivers EBM sont légitimés par le
  cross-check population (`crosscheck_tree_vs_ebm.json`).
  ⚠️ **Asymétrie côté publication** : les 3 proxys `ML_ONLY` (`pos_frac_deaths_in_fog`,
  `pos_avg_unaccounted_enemies`, `pos_overext_x_unaccounted`) nourrissent le MODÈLE mais
  sont RETIRÉS du payload publié (`sync_cloudflare._is_ml_only`, garde par `assert` sur le
  payload sortant, pendant de celui de `compare.py`) : l'onglet est lu par le joueur, et
  lui montrer une barre « morts en fog » lui opposerait une info reconstruite a posteriori
  qu'il n'avait pas. Ce qui est publié est donc un EXTRAIT (top-20 sur 125 features, proxys
  retirés) : la somme des barres ne vaut pas le score, c'est assumé. L'onglet porte la
  mention de lecture descriptive, en particulier pour `map_depth` (marqueur de risque).
  Cf. spec locale
  `docs/superpowers/specs/2026-09-08-unified-ebm-analysis-design.md`.

- **Incrément LLM enrichi validé (cohorte de prompt)** ✅ — 2026-09-07. Lot frais de 10 reviews
  par-game sous la cohorte `350f7c404b5b` (`kimi-k2.6`), évalué automatiquement AVANT toute
  annotation : ancrage des nombres **97,2 %** (252 nombres, 92,5 % exacts), des horodatages
  **99,3 %** (134 horloges), **0 violation d'asymétrie** ; contrefactuels (3 runs,
  `data/07_coaching/spadzze/eval/counterfactual.json`) sensibilité **1,00**, ancrage 93,1 %.
  Annotation humaine ensuite : 10/10 reviews, **100 % de `mistakes` utiles** (40 items) contre
  96,4 % pour la cohorte antérieure `none` (12 reviews). Critère produit (≥ 70 % sur ≥ 10
  reviews) atteint. ⚠️ Les deux cohortes sont deux populations **observées** : games, payload
  et prompt ont changé ensemble, l'écart n'est pas attribuable au seul prompt.
- **Coaching unitaire servi par le site** ✅ — 2026-09-07. `POST /api/coach/game` analyse UNE
  partie depuis le bundle KV de payloads, `GET /api/c/{slug}/coaching-context` dit quoi
  analyser (scopes, champion principal, fraîcheur des bilans) et `curation.ts` désigne la
  partie pédagogiquement utile. Les appels payés sont protégés par mot de passe (`auth.ts`) et
  sérialisés par joueur par le Durable Object `CoachGate` : c'est la réponse au risque d'une
  « mise à jour globale » qui aurait régénéré 30 games d'un coup.
  ⚠️ Déploiement : `npx wrangler secret put COACH_AUTH_PASSWORD` + un `wrangler deploy` pour
  appliquer la migration `v1-coach-gate` ; sans le binding, l'API répond mais sans verrou.
- **Migration web Cloudflare** ✅ — 2026-08-31. `web/cf/` sert l'API TypeScript et le frontend
  sur `https://coaching-lol.jeanvg.fr`, avec lecture/écriture Cloudflare KV et coaching Ollama
  diffusé en SSE. La collecte Riot et le calcul ML restent locaux puis sont publiés par
  `sync_cloudflare.py`. L'ancienne app Fly ne reçoit plus de trafic et est inactive ; Fly bloque
  sa suppression sans ajout de carte bancaire, elle est donc laissée en l'état sans réactiver
  la facturation. L'historique local disponible a été fusionné dans KV (17 reviews, 5 feedbacks) ;
  le volume Fly n'a pas été rapatrié davantage, par choix.
- **Dépôt exécutable après clone** ✅ — 2026-09-04. `make demo` (README en tête) : 0 réseau,
  0 clé, 49 parties réelles pseudonymisées dans `tests/fixtures/demo/` (3,2 Mo), et la chaîne
  de PRODUCTION rejouée dessus (`reextract_silver` → `rebuild_gold` → `compare` → `coach
  --mock-llm` → `grounding`). Seul l'appel modèle est remplacé (`src/04_coaching/mock_llm.py`,
  substitué à `llm_client.generate` : le reste du chemin — schéma, validation Pydantic,
  télémétrie, persistance — reste celui de prod, et le mock ne cite que des chiffres du
  payload pour que `grounding` derrière rende un taux vrai). **Effet CI** : les 7 goldens de
  parité `payload.py` ↔ `readers.ts` lisaient `data/03_gold/` (gitignoré) et se *skippaient*
  en CI, donc verts sans rien vérifier ; adossés aux fixtures ils s'exécutent, et ont
  immédiatement révélé un vrai défaut — `_zone_phase_signals` itérait `set(me) | set(ref)`,
  donc à delta égal l'ordre dépendait du `PYTHONHASHSEED` (payload non déterministe entre
  deux runs) alors que le TS partait de clés triées. Corrigé + test de régression.
- **Phase 1 VALIDÉE** ✅ — positionnement reconstruit sans vision. Insight type :
  « 1 ennemi = 5/8 de tes morts » >> « meurs moins ».
- **Phase 1.5 — agrégation multi-games** ✅ — pattern récurrent sur 14-20 games : ~37 % des
  morts ADC = BOT en early ; l'ennemi ADC signe ~45 % des morts.
- **Phase 1.6 — référentiels multi-rangs** ✅ — collecte globale ~4454 games / patch 16.13
  (Diamond, Master, GM, Challenger). `compare.py` et benchmarks contextuels intégrés.
- **Phase 1.7 — ML & SHAP** 🚧 — pipeline médaillon industrialisé. Classif High-Elo vs Low-Elo
  (ensemble XGB/RF/EBM). Dataset densifié : 2 ADC/game depuis le raw → ~7 873 rows.
- **Phase 1.8 — macro-positionnement (timeline, 0 CV)** ✅ — module `positioning` (17 features).
  ML : AUC **dia_chall 0.655 → 0.724 (+0.069)**, top-3 discriminants EBM tous positionnels.
  (Chiffres de juillet, sur ~7 873 rows : le rebuild du 2026-09-09 sur 43 000 rows donne
  0.6312, cf. l'entrée « Per-game rang : ABANDONNÉ ». L'apport des features positionnelles
  n'a pas été re-mesuré sur la population densifiée.)
  Coaching : 14 features câblées dans `aggregate`/`compare`. ⚠️ `xgb/rf/ebm_highelo.pkl` à
  ré-entraîner avant de servir en inférence web — per-game déprécié 2026-07-18, non servi ; le
  serving utilise les `*_player_highelo.pkl`. **AUC high_elo = 0.589** (frontière Master|GM
  peu séparable sur features macro, contrairement à dia_chall).
- **Rang ML estimé (web)** ✅ — onglet Historique de `/c/{slug}` : rang placé par l'ensemble
  xgb+rf sur les dernières games ADC, calibré par `calibrate_rank.py`. Confiance affichée
  explicitement (signal faible) — pas de fausse certitude.
- **Rang ML per-player (constance)** ✅ — `src/core/ml_rank.py` utilise le modèle per-player
  (features mean/std/p10/p50/p90 + `win_rate`, seuil `MIN_ADC_GAMES=15`), reprenant l'hypothèse
  validée par `poc/per_player_hypothesis.py` (dispersion/plancher > tendance centrale).
  **`MIN_PLAYER_GAMES=15`** (relevé 5→15 : à 5 games l'AUC s'effondrait à 0.531, bruit de
  matchmaking > signal de dispersion ; agrégation sur tout l'historique + `win_rate` corrige).
  **AUC_cv purgée 0.635** (982 joueurs 491/491, après densification sweet-spot `[15,30[` hors
  diamond, 2026-07-06 ; dispersion 57.9 % du signal SHAP). Fuite par games partagées ≈ +0.005
  d'AUC (purge = 8.7 % des games de train, 0 joueur droppé) — l'hypothèse constance tient.
  **AUC vs N** (`analyze_auc_vs_ngames.py`) : pool fixe ≥50, N=15→0.588, 20→0.619, 25→0.628,
  **30→0.635 (peak)**, 40→0.624, 50→0.599. Sweet spot ~30 ; au-delà = bruit CV. La config prod
  (qualify=15, cap=tout l'historique) ≈ le peak — déjà au plateau ; monter le seuil ne gagnerait
  que ~+0.01-0.02 pour un pool divisé par 2-3. **Plafond ~0.65** sur la frontière master/GM —
  les leviers sont le pool (densifier), les features, ou la frontière de rang (dia_chall 0.72),
  pas plus de N ni de joueurs sur cette bande. Historique complet des runs dans
  `data/05_model/player_metrics.json`.
- **Régression LP (hybride, apex tiers)** ✅ — 2026-07-07. Pipeline : `fetch_apex_lp.py` →
  `build_player_lp_dataset.py` (per-player SANS balance-cap, apex seulement, diamond exclu) →
  `train_player_lp.py` (ensemble xgb/rf/ebm REGRESSORS, random search graine fixe en purged CV,
  sélection au Spearman pooled OOF, SHAP). Serving hybride : `ml_rank.predict_rank` ajoute
  `predicted_lp` (moyenne ensemble, ≥0) quand le rang placé est apex et que les `.pkl` LP
  existent (dégradation propre sinon) ; le placement binaire 4 rangs est inchangé. Drift
  temporel du label LP (fetch au train vs games jusqu'à ~13 j) = limite connue actée. Spec :
  `docs/superpowers/specs/2026-07-07-lp-production-design.md`.
  **Métriques run 2026-07-07** (`data/05_model/player_lp_metrics.json`) : 1148 joueurs
  (master 703 / challenger 367 / grandmaster 78, 130 droppés sans LP courant). Ensemble OOF
  purgé : **Spearman pooled = 0.5186** (baseline POC 0.5028, gate passée) ; by_tier challenger
  0.5995, grandmaster 0.5979, master 0.4103 ; RMSE 517.2 LP. Dispersion = 56.1 % du signal SHAP.
- **Recherche — transformer séquentiel + SSL** ✅ — 2026-07-18. Branche parallèle
  `research/sequence-transformer` (0 perturbation du pipeline existant). Transformer à la main
  (4 couches, d_model=64, masked-mean-pool) sur les séquences d'états par-minute (20-d : ADC ciblé
  + adverse + diffs gold/cs/xp/level), CV purgé identique au baseline tabulaire (folds
  joueur-groupés + purge miroir, standardisation per-feature **train-only par fold non
  négociable**). Étape 1 supervisée vs ensemble tabulaire (RF+EBM) + MLP contrôle ; Étape 2 SSL
  mask-and-reconstruct (delta mesuré, pretrain par-fold train-only → delta propre, pas d'avantage
  transductif). Verdict sur `dia_chall` ; `high_elo` (master/GM) null = bruit de label non
  interprétable (plafond ~0.589 connu). Spec : `docs/superpowers/specs/2026-07-18-sequence-transformer-design.md`.
  Métriques : `data/05_model/sequence_metrics.json`.
  **Métriques run 2026-07-18** (`data/05_model/sequence_metrics.json`) : `dia_chall` séquence
  **AUC 0.645** (±0.008, 42 996 rows) BAT tabular 0.633 / MLP 0.530 → la représentation séquentielle
  capte un signal que l'agrégat rate sur la frontière séparable (thèse renforcée). `high_elo`
  séquence 0.546 ≈ tabular 0.554 ≈ bruit (95 378 rows, master/GM peu séparable). SSL
  `delta_ssl = -0.0195` (≈0) : le prétexte MSE mask-and-reconstruct est faible sur signaux lisses
  (gold monotone, position continue → quasi-interpolation) — **pas un verdict sur le SSL en
  général**, un prétexte prédictif (future-event) reste à tester en étape 3. ⚠ **Caveat env Mac** :
  torch, scikit-learn et xgboost embarquent chacun leur `libomp.dylib` ; deux runtimes OpenMP
  initialisés dans le même processus → SIGSEGV/deadlock (reproduit : la suite plantait dans
  `train_sequence_model._train_one_task` après les fits sklearn/xgboost d'un test antérieur).
  La suite pytest est immunisée par le garde-fou en tête de `tests/conftest.py`
  (`OMP_NUM_THREADS=1` + `KMP_DUPLICATE_LIB_OK=TRUE`, darwin seulement, avant tout import ; le
  flag seul NE suffit PAS, vérifié) + canary `tests/test_openmp_coexistence.py`. Les runs
  manuels restent dans la configuration documentée : baseline tabulaire RF+EBM (xgb exclu) ;
  en cas de blocage pareil, préfixer `OMP_NUM_THREADS=1 KMP_DUPLICATE_LIB_OK=TRUE`. Pas
  d'export `~/.zshrc` (plafonnerait les threads de tous les projets). MPS n'implémente pas le
  nested-tensor de `src_key_padding_mask` → run CPU (`--device cpu`). 0 API (relit `_read_raw`).
- **Protocole d'éval gold standard (per-player)** ✅ — 2026-07-18. Split canonique unique
  `data/04_dataset/split.json` (par joueur, stratifié, graine fixe, 70/15/15, cf.
  `src/core/dataset_split.py` + `src/01_data_engineering/build_split.py`). Sélection des
  hyperparamètres en k-fold SUR LE TRAIN, headline sur le TEST held-out ; calibration + test
  hors du modèle servi (réservée à une future couche calibration/conformal, non encore
  implémentée).
  Purge étendue via `purged_train_features` (fold-val ∪ holdout). ⚠ Le headline test est
  volontairement plus bas que les anciens OOF-à-plat (fin de l'optimisme de sélection + modèle
  sur ~70 % des joueurs) : c'est la mesure honnête. **FLAW ASSUMÉ (GM)** : ~78 GM au total →
  calib/test GM petits (~12 chacun), métriques GM bruitées ; remédiation renvoyée à un script
  ultérieur. Spec : `docs/superpowers/specs/2026-07-18-gold-standard-eval-protocol-design.md`.
  **Métriques run 2026-07-18** — rang (`player_metrics.json`) : cv_train.auc=0.5912 (n=687,
  343/344) / test.auc=0.677 (n=147, 73/74) ; split 1345 joueurs (train 942 / calib 202 / test
  201, 70/15/15 stratifié). LP (`player_lp_metrics.json`) : cv_train.spearman_pooled=0.4931
  (rmse 535.4, n=805) / test.spearman_pooled=0.5373 (rmse 555.1, n=170) ; by_tier test :
  challenger 0.6601 (n=55), grandmaster 0.7545 (n=11, bruité), master 0.3634 (n=104).
- **Per-game rang : ABANDONNÉ (2026-09-08, acté)** : la frontière master/GM est illisible
  à N=1. Trois mesures, trois populations, même verdict : ensemble tabulaire per-game
  `high_elo` auc_cv 0.609 (`metrics.json`, n_train 18 734) ; et dans l'étude séquence
  (95 378 rows) transformer 0.546 ± 0.005 ≈ baseline tabulaire 0.554 ≈ MLP 0.504. La même
  frontière est lisible au niveau joueur (per-player test held-out 0.688).
  `calibrate_rank.py` reste déprécié (le rang servi = per-player calibré).
  `train_ensemble.py --target dia_chall` reste VIVANT avec un rôle réacté (2026-09-08) :
  modèle d'explication du jeu-type pour l'analyse glass-box, nœud du DAG
  (`metrics_dia_chall.json`), jamais servi pour le rang.
  ⚠️ **Le critère de décision qui justifiait ce nœud a cessé de discriminer** (rebuild
  complet 2026-09-09) : dia_chall auc_cv = **0.6312** (`metrics_dia_chall.json`, n_train
  43 000 = 25 675 challenger / 17 325 diamond, 41 features), et non les 0.724 mesurés en
  juillet sur ~7 873 rows. L'écart avec le 0.609 qui a condamné le per-game `high_elo`
  passe de 0.115 à 0.022. Le protocole CV est INCHANGÉ entre les deux runs : « l'ancien
  0.724 était optimiste par fuite » est donc écarté, la cause est le changement de
  population (densification). Ce qui légitime encore ce nœud n'est plus un AUC absolu mais
  **`ebm_gap_vs_ensemble` = 0.0004** : l'EBM seul égale l'ensemble, donc son explication
  décrit fidèlement le modèle, indépendamment de la force du signal. Conséquence à tenir :
  un jeu-type séparable à 0.63 reste faiblement séparable ; les seuils de bascule des shape
  functions sont **descriptifs**, jamais des cibles à atteindre.
- **Compte-rendu par-game (axe prioritaire coaching)** ✅ — 2026-07-05. Diagnostic feedback :
  les tags « trop-vague »/« non-actionnable » venaient du **payload agrégé** (le LLM ne peut pas
  être plus précis que des médianes) + du schéma forçant 3 forces. Fix : `game_journal` (morts/
  recalls horodatés + contexte) → `coach.py --game` → `GameReview` (horodatage obligatoire par
  erreur au niveau schéma). Vérifié bout en bout (kimi-k2.6). **Itération cause (2026-07-08)** :
  2e signal feedback (« je sais pas pourquoi je suis mort », « aucune idée de pourquoi » sur les
  forces) → `GameInsight` ajoute un champ `cause` obligatoire (POURQUOI = mécanisme de mort /
  comportement) sur forces ET erreurs, + `SYSTEM_GAME` restitue le contexte de mort du journal
  (killer/gank/zone/objectif). Validé : « tu prolonges en lane sans gold à dépenser → exposé aux
  all-ins 2v2 et ganks (morts à 4:42 par Karma…) ». **Métrique de succès : ≥70 % de mistakes
  utiles sur ≥10 reviews par-game annotées, 0 rejet « trop-vague ».**
- **Premier verdict ADC** : laning = LE levier (≈ -10 à -16 CS @14 vs challenger, *toutes*
  issues) ; mauvaise gestion du retard (gold@20 en lose -1252 vs -322) ; morts = symptôme.
- Clé **dev** (throttle ~100 req/2min, attentes 429 si saturé) → rate-limiter intégré.
  `.env` (clé `RIOT_API_ID` ; pas de `RIOT_REGION` → passer `--region euw1`), `data/` ignoré.

