# TODO — RiftSense

> État au 2026-09-07. Ce fichier ne conserve que les travaux encore actionnables.
> Les résultats historiques et fonctionnalités terminées sont documentés dans
> `CLAUDE.md`, `docs/MODEL_CARD.md` et `src/04_coaching/README.md`.

## ✅ Priorité 0 — incrément LLM enrichi validé (2026-09-07)

Lot frais de 10 reviews par-game généré sous la cohorte de prompt `350f7c404b5b`
(`kimi-k2.6`), évalué automatiquement AVANT toute annotation humaine :

- **Éval automatique** : ancrage des nombres 97,2 % (252 nombres, 92,5 % exacts),
  horodatages 99,3 % (134 horloges), 0 violation d'asymétrie
  (`grounding.py --player spadzze --kind game --prompt-version 350f7c404b5b`) ;
  contrefactuels 3 runs, sensibilité 1,00, ancrage 93,1 %
  (`data/07_coaching/spadzze/eval/counterfactual.json`).
- **Annotation humaine** : 10/10 reviews annotées, 100 % de `mistakes` utiles (40 items),
  contre 96,4 % pour la cohorte antérieure `none` (12 reviews). Critère produit
  (≥70 % sur ≥10 reviews) atteint.
- Les deux cohortes restent deux populations **observées** : games, payload et prompt ont
  changé ensemble, l'écart n'est pas attribuable au seul prompt.

Reste facultatif : `model_ab.py --player spadzze --n 3` (`kimi-k2.6` vs `glm-5.3`) si le
choix du modèle doit être rouvert. Le payload y est contrôlé, la mesure porte sur ancrage,
sensibilité, schéma et latence.

## ⚡ Priorité 0 bis — exploiter le feedback de lecture des 10 reviews

Design validé et amendé :
`docs/superpowers/specs/2026-09-05-coaching-recalls-tracking-categories-design.md`
(recalls jugés aux CS perdues et au spike adverse, jungle tracking, erreurs découpées et
titrées par catégorie). Rien n'est implémenté : ni `src/core/turrets.py`, ni
`src/core/journal_signals.py`, ni la table `data/00_static/sr_turrets.json`.

- [ ] **Écrire le plan** depuis la spec amendée, puis l'exécuter en TDD.
- [ ] **Regénérer un lot** sous la nouvelle empreinte de prompt et le comparer à la cohorte
  `350f7c404b5b` comme troisième population observée (le seuil ≥70 % est déjà atteint : la
  question devient la précision des recalls et la lisibilité des erreurs, pas l'utilité).
- [ ] **Décider du coût d'une mise à jour globale** côté site. Le verrou `CoachGate` et le
  coaching unitaire à la demande évitent la régénération de 30 games d'un clic ; il reste à
  fixer si un bouton « tout mettre à jour » existe, et sous quel plafond.

## 🔎 Priorité 1 — corriger le diagnostic ML avant de réentraîner

- [ ] **Corriger le faux positif `dataset_report` 1 345 → 982.** Le split canonique contient
  l'union des datasets rang + LP (1 345 joueurs), alors que le classifieur de rang consomme
  `adc_player_dataset.parquet` (982 joueurs). `model_crosscheck` additionne aujourd'hui toute
  l'union au lieu de l'intersecter avec la population réellement consommée.
  - Population rang actuelle attendue après intersection : train 687, calibration 148,
    test 147, total 982.
  - Ne pas conclure à une dérive ni réentraîner sur la seule différence 1 345/982.
- [ ] **Ajouter une identité de dataset aux artefacts ML** (empreinte des `puuid`, features,
  seuil `MIN_PLAYER_GAMES`, split et fenêtre de données). Déclencher un réentraînement
  seulement si cette identité ou le protocole diffère réellement du modèle servi.
- [ ] **Décider explicitement de la politique temporelle.** Les données actuelles viennent
  uniquement du patch 16.13 et ont environ 60–73 jours : soit le modèle est une étude figée
  sur ce patch et on le documente, soit il est servi comme produit courant et il faut définir
  un cycle collecte → rebuild → évaluation held-out → publication.

## 📊 Priorité 2 — données et objectif ML

- [ ] **Choisir une frontière de rang défendable avant de collecter davantage.**
  - Grandmaster est une population structurellement petite : ne pas créer de ticket
    « densifier GM » impossible à fermer.
  - Pour une frontière Master/GM, fusionner GM avec Master ou Challenger selon la question,
    ou collecter plusieurs régions si une estimation GM spécifique est indispensable.
  - La frontière `dia_chall` est la seule clairement séparable aujourd'hui (AUC ≈0,72 contre
    ≈0,59 pour `high_elo`) : densifier Diamond est pertinent uniquement si elle devient
    l'objectif principal.
- [ ] **Reformuler la robustesse SHAP.** SHAP explique actuellement le profil ML ; il ne doit
  pas devenir automatiquement une prescription. Mesurer la stabilité des directions entre
  folds, graines, modèles et patches, puis confronter uniquement les features
  `COACHING_SAFE` aux heuristiques et au feedback humain.

### Pas de densification à lancer actuellement

- **Zeri référentiel** : déjà 454 à 1 385 games selon le rang ; les principaux buckets de
  contexte sont au-dessus du seuil de repli. Densifier seulement après un changement de patch
  ou si une nouvelle sous-slice tombe sous son seuil d'effectif.
- **Zeri personnel** : 24 games pour Spadzze. Ce manque se résorbe par l'usage/collecte du
  joueur, pas par davantage de référentiel.
- **Équilibre binaire** : le dataset per-player est déjà équilibré à 491 high / 491 low.
  Le sujet restant est la définition de la frontière, pas un undersampling supplémentaire.

## 🔧 Priorité 3 — maintenance opportuniste

- [ ] **Mutualiser `compare.py` et `payload._*_signals`** seulement lors de la prochaine
  évolution des signaux/seuils. Le recouvrement existe, mais les consommateurs sont distincts
  et les tests de parité réduisent le risque immédiat.
- [ ] **Remplacer “industrialisation Pydantic + Parquet/DuckDB” par des tickets concrets**
  lorsqu'un défaut observé le justifie. Parquet, `04_dataset`, `05_model` et les schémas
  Pydantic du coaching sont déjà en place ; DuckDB n'est pas nécessaire au volume courant.
- [ ] **Nettoyer la documentation devenue incohérente** : volumes historiques obsolètes,
  critères d'évaluation désormais atteints et sens de `avg/max_map_depth` (valeur haute =
  marqueur plus Diamond/risqué dans le code, jamais une prescription positive).

## ✅ Acquis à ne plus remettre dans la file de travaux

- Reviews agrégées et par-game (`--game`, `--game-batch`), agents spécialisés optionnels.
- Payload enrichi : dégâts fatals, matchup, sorts/runes/build et prochain achat réel.
- Structured output, validation Pydantic, grounding, contrefactuels et feedback humain.
- Cloudflare Worker + KV + SPA, streaming SSE et chat coaching asymétrie-safe.
- Pipeline Parquet/ML/SHAP et manifeste `COACHING_SAFE` / `ML_ONLY`.
