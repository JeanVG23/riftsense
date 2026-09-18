# Candidature Clé Production Riot Games API (RiftSense)

Ce document rassemble l'ensemble des informations prêtes à copier-coller dans le formulaire de candidature **Register a Product / Production API Key** sur le portail [developer.riotgames.com](https://developer.riotgames.com).

---

## 📋 Informations Produit (Product Information)

### Product Name*
```text
RiftSense
```

---

### Product Description*
*(Texte rédigé en anglais selon les exigences strictes de Riot Games)*

```text
RiftSense is a non-commercial educational analytics and machine-learning coaching platform that helps League of Legends players understand and improve their macro-gameplay and spatial positioning after completed matches.

What it does:
- Player Profile & Match History: lets players review public Ranked Solo/Duo match history, recent performance, and macro-metrics.
- Spatial Analysis: measures map-zone presence, roaming habits, warding efficiency, and death locations relative to vision control.
- Explainable ML: benchmarks observable macro habits against high-elo distributions using EBM and SHAP, highlighting strengths and improvement areas.
- Post-Game Feedback: provides structured, evidence-based review points grounded in comparative facts.

Riot APIs used:
- account-v1: resolves Riot IDs to encrypted PUUIDs.
- match-v5: fetches recent Solo/Duo match IDs, summaries, and frame-by-frame timelines.
- league-v4: fetches current ranked tier and division for contextual comparisons.

Compliance & fair play:
- Strictly post-game: no real-time gameplay assistance, in-game overlay, game-client interaction, or game-memory reading.
- Respects fog of war and information asymmetry; players are not faulted for actions based on information they could not see.
- Not an MMR/ELO calculator and does not claim to reveal hidden MMR.
- Free and non-commercial: no subscriptions, paywalls, or advertising tracking.
```

---

### Product Group*
```text
Default Group
```
*(Laisse la sélection par défaut « Default Group » à moins d'avoir créé un groupe spécifique sur ton compte Riot).*

---

### Product URL*
```text
https://riftsense.jeanvg.fr
```

---

### Product Game Focus*
```text
League of Legends
```

---

### Are you organizing tournaments?*
```text
No
```

---

## 🔗 Liens Légaux (Legal URLs demandés par Riot)

### Terms of Use URL
```text
https://riftsense.jeanvg.fr/terms
```

### Privacy Policy URL
```text
https://riftsense.jeanvg.fr/privacy
```

---

## 📝 Notes pour les Reviewers Riot (App Notes / Reviewer Guidance)

Riot propose souvent un champ libre pour ajouter des précisions aux testeurs. Voici ce que tu peux y coller pour leur faciliter l'audit immédiat :

```text
Reviewer Guidance & Quick Demo Links:

1. Live Public Demo Profiles (no login needed):
- High-Elo calibrated profile with active SHAP model: https://riftsense.jeanvg.fr/c/spadzze?tab=shap
- Grandmaster calibrated profile: https://riftsense.jeanvg.fr/c/aceofspadzze?tab=shap
- Methodology & Architecture documentation: https://riftsense.jeanvg.fr/readme

2. Terms & Privacy (Publicly accessible in footer):
- Terms of Service: https://riftsense.jeanvg.fr/terms
- Privacy Policy: https://riftsense.jeanvg.fr/privacy

3. Note on AI Coaching Tab:
The core product (player history, match timeline features, EBM & SHAP explainability model) is completely public and unrestricted. The optional LLM coaching review tab is gated to protect inference capacity for this personal non-commercial project. If reviewer access is required, a temporary single-use reviewer password can be provided through a private support channel and revoked after the review.
```

---

## 🔐 Étape suivante : Vérification du domaine (`riot.txt`)

Une fois ce formulaire soumis sur le portail Riot :
1. Riot t'affichera une chaîne ou un fichier de vérification nommé `riot.txt`.
2. Dépose ce fichier dans le dossier :
   ```bash
   web/cf/public/riot.txt
   ```
3. Déploie sur Cloudflare :
   ```bash
   cd web/cf
   npm run build
   npx wrangler deploy
   ```
4. Clique sur **Verify Domain** sur le portail développeur Riot Games.
