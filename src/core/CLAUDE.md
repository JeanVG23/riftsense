# src/core/ — libs partagées du pipeline médaillon

> Chargé automatiquement quand on travaille dans ce dossier. Contexte général
> du projet (vision, phases, architecture globale) : `CLAUDE.md` à la racine.

- **`riotlib.py`** — socle (helpers de chemins médaillon `silver_games`/`gold_base`/
  `gold_aggregate`/`silver_roots` + `KIND_REF`/`KIND_PERSONAL` — ⚠️ résolus depuis `DATA` À
  L'APPEL, les tests substituant `rl.DATA` ; primitives publiques `participant_id`/`find_pid`/
  `frames_by_minute`/`iter_events`/`cs_of` ; `MatchCache` = travail par-match partagé par
  `extract_all_games`) : `RiotClient` (routing régional account/match vs plateforme league ;
  rate-limiter ~1.3s/appel ; `entries_by_puuid` = rang courant via league-v4, frais pour le
  coach web), helpers (`approx_zone`, `phase_of`, `patch_of`), `get_match_timeline` (cache raw
  compressé zstd), `extract_game` (silver + benchmark de lane + sous-objet `comp` des 6 champions
  botlane + sous-objet `position` via `positioning`), `aggregate`/`write_gold` (gold, facettes
  win/loss + dimension `by_lane_context` + bloc `positioning` = médianes des 14 features
  COACHING_SAFE via `_fmedian`, sans arrondi entier), chemins médaillon. Importe `champion_profiles`.
- **`positioning.py`** — features macro-positionnement depuis la timeline (0 CV, module pur).
  `positioning_features` → 17 scalaires nichés sous `record["position"]`. Manifeste d'asymétrie
  mécanique : `COACHING_SAFE` (14 exactes → ML + coaching) vs `ML_ONLY` (3 proxys vision →
  jamais prescrits). ⚠️ **Profondeur** (`avg/max_map_depth`) : sens contre-intuitif (valeur haute
  → diamond, rang INFÉRIEUR) → marqueur de risque, jamais à prescrire.
- **`game_journal.py`** — journal structuré d'UNE game depuis match+timeline raw (0 CV). Morts
  et recalls **horodatés** (clock mm:ss) avec contexte : zone/phase, gold-state vs adversaire,
  **gold non dépensé**, killer/gank, **objectif up/imminent** (timers v1 en tête de module :
  drake 5:00/+5:00, baron 25:00/+6:00 — ajuster par patch ; Elder/Atakhan ignorés). Recalls =
  clusters d'`ITEM_PURCHASED` (inclut resets après mort, `gold_before` = plancher frame précédente),
  **`item_ids`** par recall (achats bruts, `ITEM_UNDO` honoré = retiré, `ITEM_SOLD` ignoré v1).
  **Asymétrie** : uniquement de l'info que le joueur avait — aucun proxy ML_ONLY.
  **Conséquences post-mort** (chaîne causale, 2026-07-18) : chaque mort porte un bloc
  `consequences` calculé mécaniquement — objectifs (`ELITE_MONSTER_KILL` ennemi) et
  bâtiments (`BUILDING_KILL`, ⚠️ `teamId` = équipe qui PERD) pris dans les
  `CONSEQUENCE_WINDOW_S=60` s post-mort, + `team_gold_swing_90s` (écart de gold
  d'équipe avant vs ~90 s après). Clé omise si fenêtre vide. `SYSTEM_GAME` impose de
  restituer la chaîne (« mort → Baron perdu → -1 840 g ») en formulation corrélationnelle.
- **`champion_profiles.py`** — identité champion : `champion_vector` (Data Dragon + table curée,
  résolution casse-insensible), `derive_context(comp)` → `lane_pattern`
  (poke/all_in/scaling/mixed/unknown) et `gank_exposure` (low/med/high/unknown). `fetch_ddragon`
  (one-shot, idempotent). Champion inconnu → `unknown`, jamais d'erreur. `fetch_ddragon_items`/
  `load_items` — même pattern one-shot pour le catalogue d'items Data Dragon (`item.json` →
  `data/00_static/ddragon/<version>/`, `{id: {name, cost}}`).
- **`ml_features.py`** — FEATURES canonique (partagé train/serve) + `aggregate_player_features`
  (mean/std/p10/p50/p90 dérivés de la table unique `AGG_FUNCS` + `win_rate`) + `resolve_rank`
  (mode, tie-break rang le plus bas). Réexporte `RANK_ORD` depuis `ranks`.
- **`ranks.py`** — source unique des rangs et des cibles binaires (`RANKS`, `RANK_ORD`,
  `HIGH_ELO`, `APEX`, `COLLECT_ORDER`, `TARGETS` = `high_elo`/`dia_chall`). Stdlib-only pour
  rester importable par la collecte. ⚠️ La frontière de rang est un paramètre de recherche
  actif : la déplacer se fait ICI, ces constantes étaient recopiées dans ~11 scripts.
- **`cli.py`** — `arg`/`flag`/`int_arg`/`csv_arg` : parseur argv des scripts de collecte
  (recopié à l'identique dans 7 fichiers).
- **`kv_keys.py`** — gabarits des clés Cloudflare KV côté Python (`key("gold", slug=…, scope=…)`),
  dont le bundle local `riftsense:{slug}:game-payloads` consommé par le coaching unitaire web.
  Miroir de `KEYS` dans `web/cf/src/readers.ts`, verrouillé par `tests/test_kv_keys_parity.py`
  (deux runtimes = deux tables, mais toute divergence de nom/gabarit fait échouer le test).
- **`ebm_explain.py`** : moteur d'analyse EBM glass-box unifié, registre déclaratif `LEVELS`
  aux rôles explicites : "player" = explication du modèle servi (features agrégées,
  drivers publiés par le sync), "game" = modèle d'explication du jeu-type dia_chall
  (re-entraîné dans le DAG, JAMAIS servi pour le rang). Shape functions exactes avec
  seuils de bascule (`shape_summary`, cœur [p5, p95]), contributions par terme,
  cross-check SHAP-sur-arbres xgb+rf (`crosscheck`), décomposition exacte d'un joueur
  (`explain_player_row` + `top_drivers`). Bibliothèque pure : 0 écriture disque, import
  shap différé (le sync ne charge pas ce runtime pour rien). Consommée par le CLI
  `03_data_analyse/shap_analysis.py --level {player,game}` et par `sync_cloudflare.py`
  (drivers per-player sous `shap:{slug}:drivers`).
