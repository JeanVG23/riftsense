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
        <span>TECHNICAL CASE STUDY · DATA ENGINEERING &amp; MACHINE LEARNING</span>
      </div>
      <h1 class="cs-title">
        RiftSense: an <span class="text-gold">end-to-end</span> predictive esports coaching system
      </h1>
      <p class="cs-subline">
        Design, training, and production deployment of a League of Legends tactical analytics platform: from ingesting 95,000 high-elo matches through the Riot Games API to local SHAP explainability and transparent AI coaching.
      </p>

      <div class="cs-hero-actions">
        <button type="button" class="btn btn-primary cs-btn-primary" @click="goToDemo">
          <span>Try the demo profile (Spadzze#EUW)</span>
          <span class="cs-btn-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" class="btn cs-btn-secondary" @click="goToReadme">
          <span>Read the full methodology (/readme)</span>
        </button>
      </div>
    </header>

    <!-- KPI Metric Strip -->
    <section class="cs-metrics-grid" aria-label="Key project metrics">
      <div class="cs-metric-card">
        <div class="cs-metric-val">47 701</div>
        <div class="cs-metric-label">Matches analyzed</div>
        <div class="cs-metric-sub">95,416 player profiles extracted (patch 16.13, EUW)</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val highlight">0.677 AUC</div>
        <div class="cs-metric-label">Test Held-out</div>
        <div class="cs-metric-sub">Apex boundary: GM/Challenger vs Master/Diamond</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val">100%</div>
        <div class="cs-metric-label">Local explainability</div>
        <div class="cs-metric-sub">EBM (Explainable Boosting Machine) &amp; SHAP values</div>
      </div>
      <div class="cs-metric-card">
        <div class="cs-metric-val">&lt; 50 ms</div>
        <div class="cs-metric-label">Response latency</div>
        <div class="cs-metric-sub">Serverless Cloudflare Workers architecture &amp; KV cache</div>
      </div>
    </section>

    <section class="cs-visual-band" aria-label="Project journey illustration">
      <div class="cs-visual-media" role="presentation"></div>
      <div class="cs-visual-copy">
        <span class="cs-visual-eyebrow">Data journey</span>
        <h2 class="cs-visual-title">From raw signals to actionable coaching</h2>
        <p class="cs-visual-sub">Every displayed metric maps to an identifiable game decision. Everything else supports the model without becoming a judgment.</p>
      </div>
    </section>

    <!-- Section 1 : Problématique métier -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">01 · PRODUCT CONTEXT</span>
        <h2 class="cs-section-title">The challenge: moving beyond surface-level statistics</h2>
      </div>
      <div class="cs-grid-two">
        <div class="cs-card">
          <h3 class="cs-card-title">The problem with conventional statistics (KDA)</h3>
          <p class="cs-text">
            Traditional competitive-game tools aggregate outcome metrics such as KDA, win rate, and total damage. These indicators suffer from <strong>survivorship bias</strong>: a player can preserve a good KDA while losing by refusing to contest major objectives.
          </p>
          <p class="cs-text">
            RiftSense aims to isolate <strong>real causal mechanisms</strong>: timing choices such as GD@14, synchronized recalls, and the cost of deaths that separate average from elite players.
          </p>
        </div>
        <div class="cs-card cs-card--accent">
          <h3 class="cs-card-title">Ethical rule: preserving fog of war</h3>
          <p class="cs-text">
            A coach should never criticize an action the player could not anticipate. Every feature based on enemy-vision proxies is classified as <code class="cs-code">ML_ONLY</code> in the data pipeline.
          </p>
          <p class="cs-text">
            A strict assertion <strong>stops inference</strong> if an unverified feature reaches the coaching layer. Of 17 positioning metrics, only the 14 guaranteed <code class="cs-code">COACHING_SAFE</code> metrics can produce player-facing feedback.
          </p>
        </div>
      </div>
    </section>

    <!-- Section 2 : Architecture du Pipeline -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">02 · DATA ENGINEERING</span>
        <h2 class="cs-section-title">End-to-end pipeline architecture</h2>
      </div>

      <div class="cs-pipeline-flow">
        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Step 1</div>
          <div class="cs-pipe-name">Collection &amp; Ingestion</div>
          <p class="cs-pipe-desc">
            Query Riot endpoints (<code class="cs-code">account-v1</code>, <code class="cs-code">match-v5</code>) and retrieve full timelines sampled every 60 seconds.
          </p>
          <span class="cs-pipe-badge">Exponential backoff &amp; KV cache</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Step 2</div>
          <div class="cs-pipe-name">Feature Engineering</div>
          <p class="cs-pipe-desc">
            Reconstruct lane states: gold and XP differences at 14 minutes (<code class="cs-code">GD@14</code>), death cost, objective conversion, and recall synchronization.
          </p>
          <span class="cs-pipe-badge">95k profiles built</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Step 3</div>
          <div class="cs-pipe-name">EBM Model &amp; SHAP</div>
          <p class="cs-pipe-desc">
            Run <em>Explainable Boosting Machine</em> inference and calculate exact local contributions for every feature without approximation.
          </p>
          <span class="cs-pipe-badge">100% native interpretability</span>
        </div>

        <div class="cs-pipe-arrow">→</div>

        <div class="cs-pipe-step">
          <div class="cs-pipe-num">Step 4</div>
          <div class="cs-pipe-name">LLM Inference &amp; Edge</div>
          <p class="cs-pipe-desc">
            Generate timestamped match reviews through Ollama, package precomputed results, and deploy globally on Cloudflare Workers.
          </p>
          <span class="cs-pipe-badge">Response &lt; 50ms</span>
        </div>
      </div>
    </section>

    <!-- Section 3 : Rigueur ML & Data Leakage -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">03 · MACHINE LEARNING</span>
        <h2 class="cs-section-title">EBM modeling and data-leakage prevention</h2>
      </div>

      <div class="cs-grid-two">
        <div class="cs-card">
          <h3 class="cs-card-title">Why Explainable Boosting Machine (EBM)?</h3>
          <p class="cs-text">
            Black-box models require slower, approximate post-hoc methods such as KernelSHAP to explain decisions.
          </p>
          <p class="cs-text">
            <strong>EBM</strong>, a generalized additive model with pairwise interactions, provides comparable performance while remaining <strong>intrinsically transparent</strong>: every feature contributes a visible scoring function.
          </p>
        </div>

        <div class="cs-card">
          <h3 class="cs-card-title">Purged Cross-Validation (Mirrored matches)</h3>
          <p class="cs-text">
            About <strong>37% of games</strong> matched two players from the dataset, producing mirrored lane metrics. Conventional cross-validation would leak information between train and test folds.
          </p>
          <p class="cs-text">
            A <strong>purged CV</strong> protocol recalculates statistics at each fold while excluding shared games, preventing a measured artificial gain of <strong>+0.005 AUC</strong>.
          </p>
        </div>
      </div>
    </section>

    <!-- Section 4 : Coaching Génératif LLM -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">04 · GROUNDED LLM GENERATION</span>
        <h2 class="cs-section-title">Timeline grounding and game context</h2>
      </div>

      <div class="cs-card cs-card--full">
        <div class="cs-llm-banner">
          <div>
            <h3 class="cs-card-title">An LLM guided by quantified evidence, not intuition</h3>
            <p class="cs-text">
              To reduce hallucinations, tactical reviews are generated through Ollama and grounded in exact metrics extracted from the timeline:
            </p>
            <ul class="cs-list">
              <li><strong>Timestamp required:</strong> Every mistake or strength is tied to an exact time, such as 18:24.</li>
              <li><strong>Measured evidence:</strong> Quantified comparison with the direct opponent and Challenger reference standards.</li>
              <li><strong>Actionable coaching:</strong> One priority improvement area for the next match.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 5 : Stack Technique -->
    <section class="cs-section">
      <div class="cs-section-header">
        <span class="cs-section-tag">05 · STACK &amp; TOOLS</span>
        <h2 class="cs-section-title">Technology stack</h2>
      </div>

      <div class="cs-stack-grid">
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Data Science &amp; ML</span>
          <span class="cs-stack-name">Python · Scikit-Learn · Interpret (EBM) · Pandas · Polars</span>
        </div>
        <div class="cs-stack-pill">
          <span class="cs-stack-category">LLM inference</span>
          <span class="cs-stack-name">Ollama · Deterministic prompt engineering · Structured JSON</span>
        </div>
        <div class="cs-stack-pill">
          <span class="cs-stack-category">Ingestion &amp; pipeline</span>
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
        <h2 class="cs-closing-title">Try the production experience</h2>
        <p class="cs-closing-text">
          The project is fully deployed in production. Try a complete profile with calculated SHAP values and generated match reviews.
        </p>
        <div class="cs-closing-actions">
          <button type="button" class="btn btn-primary cs-btn-primary" @click="goToDemo">
            <span>Open the reference profile (Spadzze#EUW) →</span>
          </button>
          <a class="btn cs-btn-secondary" href="https://github.com/JeanVG23/riftsense" target="_blank" rel="noopener noreferrer">
            <span>Source code on GitHub ↗</span>
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
  font-size: clamp(38px, 5.2vw, 52px);
  line-height: 1.12;
  letter-spacing: -.03em;
  font-weight: 850;
  color: var(--text);
  margin: 0;
  max-width: 1040px;
}

.cs-subline {
  font-size: 18px;
  line-height: 1.62;
  color: var(--text-dim);
  max-width: 920px;
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
  font-size: 24px;
  font-weight: 850;
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
