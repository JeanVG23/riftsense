<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function goToDemo(): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  void router.push("/c/spadzze");
}

function goToReadme(): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  void router.push("/readme");
}
</script>

<template>
  <div class="case-study-page">
    <!-- Hero Header -->
    <header class="cs-hero">
      <div class="cs-eyebrow">
        <span class="cs-eyebrow-dot"></span>
        <span>ÉTUDE DE CAS TECHNIQUE · DATA ENGINEERING &amp; MACHINE LEARNING</span>
      </div>
      <h1 class="cs-title">
        RiftSense : Système prédictif et coaching esport <span class="text-gold">de bout en bout</span>
      </h1>
      <p class="cs-subline">
        Conception, entraînement et mise en production d'une plateforme d'analyse tactique pour League of Legends : de l'ingestion brute de 95 000 parties de haut niveau (API Riot Games) à l'explicabilité locale SHAP et au coaching IA sans boîte noire.
      </p>

      <div class="cs-hero-actions">
        <button type="button" class="btn btn-primary cs-btn-primary" @click="goToDemo">
          <span>Tester le profil de démonstration (Spadzze#EUW)</span>
          <span class="cs-btn-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" class="btn cs-btn-secondary" @click="goToReadme">
          <span>Consulter la méthodologie complète (/readme)</span>
        </button>
      </div>
    </header>

    <!-- KPI Metric Strip -->
    <section class="cs-metrics-grid" aria-label="Métriques clés du projet">
      <div class="cs-metric-card">
        <div class="cs-metric-val">47 701</div>
        <div class="cs-metric-label">Matchs analysés</div>
        <div class="cs-metric-sub">95 416 profils joueurs extraits (patch 16.13, EUW)</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val highlight">0.677 AUC</div>
        <div class="cs-metric-label">Test Held-out</div>
        <div class="cs-metric-sub">Frontière Apex : GM/Challenger vs Master/Diamond</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val">100%</div>
        <div class="cs-metric-label">Explicabilité locale</div>
        <div class="cs-metric-sub">EBM (Explainable Boosting Machine) &amp; valeurs SHAP</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val">&lt; 50 ms</div>
        <div class="cs-metric-label">Latence de restitution</div>
        <div class="cs-metric-sub">Architecture serverless Cloudflare Workers &amp; KV cache</div>
      </div>
    </section>

    <section class="cs-visual-band" aria-label="Illustration de la trajectoire du projet">
      <div class="cs-visual-media" role="presentation"></div>
      <div class="cs-visual-copy">
        <span class="cs-visual-eyebrow">Ascension data</span>
        <h2 class="cs-visual-title">Du signal brut au coaching actionnable</h2>
        <p class="cs-visual-sub">Chaque métrique remonte à une décision de jeu identifiable. Le reste, silencieux, sert le modèle sans servir de jugement.</p>
      </div>
    </section>

    <!-- Section 1 : Problématique métier -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">01 · CONTEXTE MÉTIER</span>
        <h2 class="cs-section-title">Le défi : dépasser les statistiques superficielles</h2>
      </div>
      <div class="cs-grid-two">
        <div class="cs-card">
          <h3 class="cs-card-title">Le problème des statistiques classiques (KDA)</h3>
          <p class="cs-text">
            Dans le jeu compétitif, les outils publics traditionnels se limitent à agréger des métriques de résultat (KDA, Winrate, Dégâts totaux). Ces indicateurs sont sujets au <strong>biais du survivant</strong> : un joueur peut afficher un bon KDA tout en perdant la partie en refusant de contester les objectifs majeurs (Baron Nashor, Dragon).
          </p>
          <p class="cs-text">
            L'objectif de RiftSense est d'isoler la <strong>causalité réelle</strong> : identifier les choix de timing (GD@14, synchronisation de recall, punitions de mort) qui font la différence entre un joueur moyen et un joueur d'élite.
          </p>
        </div>
        <div class="cs-card cs-card--accent">
          <h3 class="cs-card-title">Règle éthique : l'intégrité du « Fog of War »</h3>
          <p class="cs-text">
            Un coach humain ne doit jamais reprocher à un joueur une action qu'il ne pouvait pas anticiper. Dans le pipeline de données, toutes les features basées sur des proxys de vision adverse sont classées <code class="cs-code">ML_ONLY</code>.
          </p>
          <p class="cs-text">
            Une assertion stricte dans le code fait <strong>crasher le processus d'inférence</strong> si une feature non vérifiée tente d'atteindre la couche de coaching. Sur les 17 métriques de positionnement, seules les 14 métriques garanties <code class="cs-code">COACHING_SAFE</code> sont exploitées pour le retour au joueur.
          </p>
        </div>
      </div>
    </section>

    <!-- Section 2 : Architecture du Pipeline -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">02 · DATA ENGINEERING</span>
        <h2 class="cs-section-title">Architecture du pipeline de bout en bout</h2>
      </div>

      <div class="cs-pipeline-flow">
        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Étape 1</div>
          <div class="cs-pipe-name">Collecte &amp; Ingestion</div>
          <p class="cs-pipe-desc">
            Interrogation des endpoints Riot (<code class="cs-code">account-v1</code>, <code class="cs-code">match-v5</code>). Récupération des timelines complètes avec événements échantillonnés toutes les 60 secondes.
          </p>
          <span class="cs-pipe-badge">Backoff exponentiel &amp; KV cache</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Étape 2</div>
          <div class="cs-pipe-name">Feature Engineering</div>
          <p class="cs-pipe-desc">
            Reconstitution des états de lane : différentiel d'or et d'XP à 14 min (<code class="cs-code">GD@14</code>), temps de mort punitif, conversion d'objectifs et synchronisation des recalls.
          </p>
          <span class="cs-pipe-badge">95k profils construits</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Étape 3</div>
          <div class="cs-pipe-name">Modèle EBM &amp; SHAP</div>
          <p class="cs-pipe-desc">
            Inférence via l'algorithme <em>Explainable Boosting Machine</em>. Calcul direct et exact des contributions locales SHAP pour chaque partie et feature sans approximation.
          </p>
          <span class="cs-pipe-badge">Interprétabilité 100% native</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Étape 4</div>
          <div class="cs-pipe-name">Inférence LLM &amp; Edge</div>
          <p class="cs-pipe-desc">
            Génération de revues de match horodatées via Ollama. Packaging des résultats pré-calculés et déploiement mondial sur Cloudflare Workers.
          </p>
          <span class="cs-pipe-badge">Restitution &lt; 50ms</span>
        </div>
      </div>
    </section>

    <!-- Section 3 : Rigueur ML & Data Leakage -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">03 · MACHINE LEARNING</span>
        <h2 class="cs-section-title">Modélisation EBM et élimination des fuites de données</h2>
      </div>

      <div class="cs-grid-two">
        <div class="cs-card">
          <h3 class="cs-card-title">Pourquoi Explainable Boosting Machine (EBM) ?</h3>
          <p class="cs-text">
            Les modèles boîtes noires (XGBoost profond, réseaux de neurones) nécessitent des approches a posteriori (KernelSHAP) très lentes et approximatives pour expliquer leurs décisions.
          </p>
          <p class="cs-text">
            L'algorithme <strong>EBM</strong> (Generalized Additive Model avec termes d'interaction par paires) offre un niveau de performance équivalent tout en rendant le modèle <strong>intrinsèquement transparent</strong> : chaque feature apporte une fonction de score visible et explicable mathématiquement au joueur.
          </p>
        </div>

        <div class="cs-card">
          <h3 class="cs-card-title">Purged Cross-Validation (Matchs miroirs)</h3>
          <p class="cs-text">
            Dans la base de données, environ <strong>37% des parties</strong> opposaient deux joueurs du dataset. Leurs métriques de lane étaient donc en miroir exact. Une validation croisée classique aurait laissé fuir de l'information entre les plis d'entraînement et de test.
          </p>
          <p class="cs-text">
            Un protocole de <strong>Purged CV</strong> a été conçu : à chaque fold, les statistiques sont recalculées en excluant les parties partagées. Cette rigueur évite une surestimation artificielle mesurée de <strong>+0.005 AUC</strong>.
          </p>
        </div>
      </div>
    </section>

    <!-- Section 4 : Coaching Génératif LLM -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">04 · GÉNÉRATION LLM SANS HALLUCINATION</span>
        <h2 class="cs-section-title">Ancrage chronologique et contextualisation des parties</h2>
      </div>

      <div class="cs-card cs-card--full">
        <div class="cs-llm-banner">
          <div>
            <h3 class="cs-card-title">Un LLM guidé par des preuves chiffrées, pas par l'intuition</h3>
            <p class="cs-text">
              Pour éviter les hallucinations fréquentes des modèles génératifs dans le domaine du jeu vidéo, les revues tactiques sont générées via un modèle open-source (Ollama) conditionné par les métriques exactes extraites de la timeline :
            </p>
            <ul class="cs-list">
              <li><strong>Horodatage obligatoire :</strong> Chaque erreur ou force relevée est attachée à une minute exacte (ex: 18:24).</li>
              <li><strong>Preuve mesurée :</strong> Comparaison chiffrée avec le vis-à-vis direct et les standards de référence Challenger.</li>
              <li><strong>Conseil actionnable :</strong> Focalisation sur un seul axe d'effort prioritaire pour le match suivant.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 5 : Stack Technique -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">05 · STACK &amp; OUTILS</span>
        <h2 class="cs-section-title">Technologies mobilisées</h2>
      </div>

      <div class="cs-stack-grid">
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Data Science &amp; ML</span>
          <span class="cs-stack-name">Python · Scikit-Learn · Interpret (EBM) · Pandas · Polars</span>
        </div>
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Inférence LLM</span>
          <span class="cs-stack-name">Ollama · Prompt Engineering déterministe · Structured JSON</span>
        </div>
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Ingestion &amp; Pipeline</span>
          <span class="cs-stack-name">Riot Games API · Match-V5 &amp; Timelines · Poetry · Pytest</span>
        </div>
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Web &amp; Edge Serving</span>
          <span class="cs-stack-name">Cloudflare Workers · TypeScript · Vue 3 · Vitest · Vite</span>
        </div>
      </div>
    </section>

    <!-- Section 6 : Call to action de clôture -->
    <section class="cs-closing-card">
      <div class="cs-closing-content">
        <h2 class="cs-closing-title">Tester la restitution en conditions réelles</h2>
        <p class="cs-closing-text">
          Le projet est entièrement déployé en production. Vous pouvez tester immédiatement un profil complet disposant des valeurs SHAP calculées et de revues de match générées.
        </p>
        <div class="cs-closing-actions">
          <button type="button" class="btn btn-primary cs-btn-primary" @click="goToDemo">
            <span>Ouvrir le profil de référence (Spadzze#EUW) →</span>
          </button>
          <a class="btn cs-btn-secondary" href="https://github.com/JeanVG23/riftsense" target="_blank" rel="noopener noreferrer">
            <span>Code source sur GitHub ↗</span>
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.case-study-page {
  display: flex;
  flex-direction: column;
  gap: 48px;
  width: 100%;
  padding: 10px 0 60px;
}

/* Hero */
.cs-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding-bottom: 8px;
}

.cs-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .08em;
  width: fit-content;
}

.cs-eyebrow-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: none;
}

.cs-title {
  font-size: clamp(32px, 5vw, 46px);
  line-height: 1.12;
  letter-spacing: -.03em;
  font-weight: 800;
  color: var(--text);
  margin: 0;
  max-width: 1000px;
}

.cs-subline {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-dim);
  max-width: 900px;
  margin: 0;
}

.cs-hero-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.cs-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  font-size: 14px;
  font-weight: 700;
}

.cs-btn-arrow {
  font-size: 15px;
  transition: transform 160ms ease;
}

.cs-btn-primary:hover .cs-btn-arrow {
  transform: translateX(3px);
}

.cs-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  font-size: 13.5px;
  font-weight: 600;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  color: var(--text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition-base);
}

.cs-btn-secondary:hover {
  background: var(--panel-hover);
  border-color: var(--primary);
}

/* Metric Cards */
.cs-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  width: 100%;
}

.cs-metric-card {
  padding: 22px 24px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--card-shadow);
}

.cs-metric-val {
  font-size: 30px;
  font-weight: 850;
  letter-spacing: -.03em;
  color: var(--text);
  line-height: 1.1;
}

.cs-metric-val.highlight {
  color: var(--primary);
}

.cs-metric-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: .02em;
  text-transform: uppercase;
  margin-top: 4px;
}

.cs-metric-sub {
  font-size: 12px;
  color: var(--text-faint);
  line-height: 1.4;
  margin-top: 2px;
}

/* Sections */
.cs-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.cs-section-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

.cs-section-tag {
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: .08em;
  color: var(--primary);
  text-transform: uppercase;
}

.cs-section-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -.02em;
  color: var(--text);
  margin: 0;
}

/* Grids & Cards */
.cs-grid-two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
  width: 100%;
}

.cs-card {
  padding: 26px 28px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-card--accent {
  background: linear-gradient(145deg, var(--surface), var(--surface-alt) 100%);
  border-color: var(--primary-border);
}

.cs-card--full {
  width: 100%;
}

.cs-card-title {
  font-size: 17px;
  font-weight: 750;
  color: var(--text);
  margin: 0;
  letter-spacing: -.01em;
}

.cs-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-dim);
  margin: 0;
}

.cs-code {
  padding: 2px 6px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--primary);
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.cs-list {
  margin: 12px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.55;
}

/* Pipeline Flow */
.cs-pipeline-flow {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}

.cs-pipe-step {
  flex: 1 1 220px;
  padding: 20px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cs-pipe-num {
  font-size: 11px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: .06em;
  text-transform: uppercase;
}

.cs-pipe-name {
  font-size: 15px;
  font-weight: 750;
  color: var(--text);
}

.cs-pipe-desc {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-dim);
  margin: 0;
  flex: 1;
}

.cs-pipe-badge {
  font-size: 11px;
  font-weight: 650;
  padding: 3px 8px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 6px;
  color: var(--primary);
  width: fit-content;
  margin-top: 8px;
}

.cs-pipe-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--primary);
  font-weight: 700;
}

/* Stack Grid */
.cs-stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  width: 100%;
}

.cs-stack-pill {
  padding: 18px 20px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cs-stack-category {
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--primary);
}

.cs-stack-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.45;
}

/* Visual editorial band */
.cs-visual-band {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  min-height: 220px;
  padding: 30px 34px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background:
    linear-gradient(100deg, rgba(255, 253, 248, .96) 0%, rgba(247, 244, 237, .82) 48%, rgba(247, 244, 237, .18) 100%),
    url('/images/targon/route-sinueuse.jpg') center 30% / cover no-repeat;
  box-shadow: var(--card-shadow);
}

.cs-visual-copy {
  position: relative;
  z-index: 1;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cs-visual-eyebrow {
  align-self: flex-start;
  padding: 4px 10px;
  color: var(--gold-deep);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.cs-visual-title {
  margin: 0;
  color: var(--ink);
  font-size: clamp(20px, 2.6vw, 27px);
  line-height: 1.2;
  letter-spacing: -.028em;
  font-weight: 760;
}

.cs-visual-sub {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.55;
}

/* Closing Card */
.cs-closing-card {
  padding: 36px 32px;
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface-alt) 100%);
  border: 1px solid var(--primary-border);
  border-radius: var(--radius);
  box-shadow: var(--card-shadow);
  width: 100%;
}

.cs-closing-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 800px;
}

.cs-closing-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  margin: 0;
  letter-spacing: -.02em;
}

.cs-closing-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-dim);
  margin: 0;
}

.cs-closing-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .cs-visual-band {
    min-height: 190px;
    padding: 24px 26px;
  }
}

@media (max-width: 768px) {
  .cs-pipe-arrow {
    display: none;
  }
  .cs-title {
    font-size: 28px;
  }
}
</style>
