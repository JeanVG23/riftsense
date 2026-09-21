<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const tab = ref("overview");
function setTab(value: string): void { tab.value = value; }

function goHome(): void {
  void router.push("/");
}

function goTerms(): void {
  void router.push("/terms");
}

function goPrivacy(): void {
  void router.push("/privacy");
}
</script>

<template>
  <div class="legal-page readme">
    <!-- Toile de fond astronomique & scientifique Targon -->
    <div class="readme-targon-backdrop" aria-hidden="true">
      <div class="readme-stone-layer"></div>
      <div class="readme-observatory-layer"></div>
    </div>

    <!-- Artefacts sacrés de mesure et d'étude sur les flancs -->
    <div class="readme-side-artefacts page-side-artefacts" aria-hidden="true">
      <div class="side-artefact-item readme-artefact--astrolabe"></div>
      <div class="side-artefact-item readme-artefact--lunaris"></div>
      <div class="side-artefact-item readme-artefact--outil"></div>
    </div>

    <div class="legal-header">
      <div class="legal-breadcrumbs">
        <a href="/" @click.prevent="goHome">Home</a>
        <span class="legal-sep">/</span>
        <span class="current">About &amp; Method</span>
      </div>
      <h1 class="legal-title">How <span class="text-gold">RiftSense</span> works</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Documentation &amp; Method</span>
        <span>Updated: 2026 Season</span>
        <span class="legal-sep">·</span>
        <span>Architecture, Data Science &amp; AI Pipeline</span>
      </p>
      <p class="legal-subline">
        The end-to-end project: from <strong>data ingestion</strong> to the <strong>evaluation loop</strong>. Recommendations are <strong>benchmarked</strong>, <strong>verifiable</strong>, and strictly respect <strong>what the player actually knew during the game</strong>.
      </p>
    </div>

    <!-- Séparateur céleste Targon -->
    <div class="celestial-divider" aria-hidden="true">
      <span class="divider-line"></span>
      <span class="divider-gem">✦</span>
      <span class="divider-line"></span>
    </div>

    <section class="legal-visual-band" aria-label="Methodology illustration">
      <div class="legal-visual-media" role="presentation"></div>
      <div class="legal-visual-copy">
        <h2 class="legal-visual-title">From raw data to quantified evidence</h2>
        <p class="legal-visual-sub">A documented pipeline, local explainability, and a measurable evaluation loop.</p>
      </div>
    </section>

    <div class="tabs" role="tablist" aria-label="Presentation sections">
      <button type="button" class="tab" :class="tab === 'overview' ? 'active' : ''" @click="setTab('overview')" :aria-selected="tab === 'overview'">Overview</button>
      <button type="button" class="tab" :class="tab === 'data' ? 'active' : ''" @click="setTab('data')" :aria-selected="tab === 'data'">Data &amp; Riot API</button>
      <button type="button" class="tab" :class="tab === 'features' ? 'active' : ''" @click="setTab('features')" :aria-selected="tab === 'features'">Features</button>
      <button type="button" class="tab" :class="tab === 'ml' ? 'active' : ''" @click="setTab('ml')" :aria-selected="tab === 'ml'">Data Science &amp; ML</button>
      <button type="button" class="tab" :class="tab === 'coaching' ? 'active' : ''" @click="setTab('coaching')" :aria-selected="tab === 'coaching'">AI Coaching</button>
      <button type="button" class="tab" :class="tab === 'feedback' ? 'active' : ''" @click="setTab('feedback')" :aria-selected="tab === 'feedback'">Feedback</button>
    </div>

    <!-- onglet Vue d'ensemble -->
    <template v-if="tab === 'overview'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>The problem with op.gg and similar tools</h2>
          <p>Existing tools mainly rely on <strong>global descriptive statistics</strong> such as KDA, turrets, and total gold. This leads to generic advice like “die less,” even when the critical decision is spatial and temporal: where to stand before an objective spawns. RiftSense takes the opposite approach by reconstructing the <strong>actual positioning and movement</strong> of all ten players from the Riot Match-V5 timeline, revealing macro dynamics more faithfully than end-of-game aggregates.</p>
        </section>

        <section class="card legal-card">
          <h2>Respecting information asymmetry</h2>
          <p>The coach <strong>never</strong> criticizes a decision based on information the player did not have through fog of war. It will not say “you should not have pushed because the enemy jungler was bot side” when the team had no vision of that jungler. Complete post-game information is used to label and contextualize situations after the fact, never to make omniscient judgments. This principle runs through the entire pipeline, from feature extraction to the prompt sent to the LLM.</p>
        </section>

        <section class="card legal-card">
          <h2>Challenger benchmark, not absolute opinion</h2>
          <p>“You recall with 1,450 gold on average, versus 1,100 for Challenger players in this matchup” is concrete and <strong>verifiable</strong>. “Recall earlier” is not. Benchmarks come directly from high-elo Riot API timelines with matched outcomes and lane contexts. Recommendations without quantified evidence are rejected throughout the pipeline.</p>
        </section>

        <section class="card legal-card">
          <h2>The end-to-end pipeline</h2>
          <ol style="margin:6px 0 0; padding-left:20px">
            <li><strong>Collection</strong> — Riot API (Match-V5 + Timeline) for the player's games and thousands of high-elo reference games. <span class="faint">→ Data tab</span></li>
            <li><strong>Extraction</strong> — raw timelines become macro features: laning phase, positioning, deaths, and matchup context. <span class="faint">→ Features tab</span></li>
            <li><strong>Aggregation</strong> — profile features are compared with reference medians under matched outcomes and contexts.</li>
            <li><strong>Machine learning</strong> — an ensemble ranks profiles and uses SHAP to explain which features matter most. <span class="faint">→ Data Science tab</span></li>
            <li><strong>Narration</strong> — an LLM turns the quantified differences into 1–3 strengths, 3 mistakes, 2 habits, and 1 focus under a strict schema. <span class="faint">→ AI Coaching tab</span></li>
            <li><strong>Evaluation</strong> — every insight can be rated useful or incorrect to measure whether the coach truly improves. <span class="faint">→ Feedback tab</span></li>
          </ol>
        </section>

        <section class="card legal-card">
          <h2>Project status</h2>
          <p>The Riot-first approach—100% API, no video capture or OCR—is operational. Reconstructed timeline positioning provides dense, usable signals. The multi-rank reference corpus (Diamond to Challenger), calibrated ML pipeline (XGBoost / Random Forest / EBM + SHAP), structured LLM coaching, and feedback loop all run in production. Live capture and computer vision remain a separate research direction outside the current scope.</p>
        </section>
      </div>
    </template>

    <!-- onglet Données & API Riot -->
    <template v-if="tab === 'data'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Riot-first</h2>
          <p>Core architectural decision: <strong>live capture and computer vision are not the active source</strong>. The post-game Riot API provides most of the data needed for positioning coaching without OCR errors.</p>
          <ul>
            <li><strong>Match-V5 + Timeline</strong> (post-game) — X/Y positions for <em>every</em> champion every 60 seconds, gold/XP/items per player, and discrete events such as kills, objectives, wards, level-ups, and purchases.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>How information asymmetry is enforced</h2>
          <p>This guardrail makes the asymmetry principle enforceable rather than aspirational:</p>
          <ul>
            <li><strong>What can be prescribed</strong> — only exact, verifiable timeline features (<span class="mono">COACHING_SAFE</span>).</li>
            <li><strong>What remains statistical</strong> — <span class="mono">ML_ONLY</span> proxies support the model but are never phrased as criticism.</li>
            <li><strong>What is used for labels</strong> — complete timelines and benchmarks compare situations afterward; they are never presented to the LLM as knowledge the player had at the time.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>APIs used</h2>
          <div style="overflow-x:auto">
          <table class="readme-table">
            <thead>
              <tr><th>API</th><th>Key endpoint</th><th>Purpose</th><th>Routing</th></tr>
            </thead>
            <tbody>
              <tr><td>account-v1</td><td class="mono">accounts/by-riot-id/{gameName}/{tagLine}</td><td>Riot ID → PUUID entry point</td><td>regional</td></tr>
              <tr><td>match-v5</td><td class="mono">matches/{id}/timeline</td><td>Core data: positions every 60s + events</td><td>regional</td></tr>
              <tr><td>league-v4</td><td class="mono">entries/by-puuid/{puuid}</td><td>Rank and LP context</td><td>platform</td></tr>
            </tbody>
          </table>
          </div>
          <p class="faint" style="margin-top:10px">account-v1 and match-v5 use <strong>regional</strong> routing (Europe/Americas/Asia), while league-v4 uses <strong>platform</strong> routing (euw1, etc.). The production key only needs polite backoff on HTTP 429.</p>
        </section>

        <section class="card legal-card">
          <h2>Storage architecture — numbered medallion layers</h2>
          <p>Each layer has one purpose and performs one transformation, so everything can be rebuilt without calling the API again:</p>
          <ul>
            <li><span class="mono">01_raw</span> — raw Riot API JSON, zstd-compressed and cached by match ID; immutable after writing.</li>
            <li><span class="mono">02_silver</span> — one cleaned row per game (features + composition), extracted from raw data.</li>
            <li><span class="mono">03_gold</span> — aggregates and benchmarks by rank and player, with win/loss facets and lane context.</li>
            <li><span class="mono">04_dataset</span> — consolidated tabular data ready for machine learning.</li>
            <li><span class="mono">05_model</span> / <span class="mono">06_shap</span> — trained models and explainability outputs.</li>
            <li><span class="mono">07_coaching</span> — persisted LLM reviews and player feedback.</li>
          </ul>
          <p>Separating raw, silver, and gold means feature changes can be replayed <strong>without a single additional API call</strong>: silver is simply re-extracted from cached raw data.</p>
        </section>
      </div>
    </template>

    <!-- onglet Features -->
    <template v-if="tab === 'features'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Four feature families</h2>
          <ul>
            <li><strong>Lane</strong> — gold, CS, and experience differences at 10, 14, and 20 minutes against the direct role opponent.</li>
            <li><strong>Positioning</strong> (17 features) — presence by map area, mid roams, overextension index, wards placed/cleared, and gold dead time. Calculated only from timeline X/Y positions, with <strong>no computer vision</strong>.</li>
            <li><strong>Deaths</strong> — distribution by area and game phase, deaths in fog versus allied vision, and gold state at the time of death.</li>
            <li><strong>Matchup context</strong> — derived from the six bot-side champions: a <em>lane_pattern</em> axis (poke / all-in / scaling / mixed) and <em>gank_exposure</em> (low/medium/high). Used only for benchmark context, never to criticize a decision using hidden information.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>The mechanical asymmetry contract: COACHING_SAFE vs ML_ONLY</h2>
          <p>Not all positioning features are equally safe under information asymmetry. The system formally separates:</p>
          <ul>
            <li><strong>COACHING_SAFE</strong> (14 features) — exact, verifiable timeline measures such as average ally distance and wards placed or cleared. They may be used for both ML and actionable coaching.</li>
            <li><strong>ML_ONLY</strong> (3 features) — noisier proxies that help the statistical model but cannot safely become actionable instructions. They support ML ranking but are <strong>never</strong> phrased as criticism.</li>
          </ul>
          <p class="faint">Special case: map depth (avg/max_map_depth) is counterintuitive—a high value marks higher rank, not a flaw. It is therefore descriptive only, never prescriptive.</p>
        </section>

        <section class="card legal-card">
          <h2>Benchmarking matched outcomes and contexts</h2>
          <p>A raw comparison with the Challenger average is misleading: a player comfortably winning lane makes different choices from one under pressure in a difficult matchup. Every feature is therefore conditioned on both <strong>win/loss outcome</strong> and <strong>matchup context</strong> (lane_pattern / gank_exposure), with fallback thresholds when a contextual sample becomes too small.</p>
        </section>
      </div>
    </template>

    <!-- onglet Data Science & ML -->
    <template v-if="tab === 'ml'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Features first, model second</h2>
          <p>Final coaching quality depends primarily on the feature layer, not the statistical model. Machine learning does not replace deterministic heuristics: it validates that signals extend beyond laning and objectively ranks which features matter most.</p>
        </section>

        <section class="card legal-card">
          <h2>From game to dataset</h2>
          <p>Each ML dataset row represents <strong>one ADC in one game</strong>, not an entire match. Both ADCs—the targeted player and direct opponent—are re-extracted from raw data to densify the reference corpus. The collected rank is assigned to both lobby ADCs under the documented approximation that high-elo SoloQ teams have similar MMR.</p>
        </section>

        <section class="card legal-card">
          <h2>An ensemble with three distinct inductive biases</h2>
          <p>Rather than one model, high-vs-low-elo classification uses three algorithm families that learn differently from the same data. Agreement across all three is more robust than a coincidence in one model:</p>
          <ul>
            <li><strong>XGBoost</strong> — gradient-boosted trees built sequentially to correct earlier errors; captures complex feature interactions.</li>
            <li><strong>Random Forest</strong> — averaged bagging of independent trees; more noise-resistant with different bias and variance from XGBoost.</li>
            <li><strong>EBM</strong> (Explainable Boosting Machine) — a generalized additive model with pairwise interactions (GA²M), glass-box by design. Its decision function can be read directly and independently validates the other two.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>SHAP — explaining a prediction, not just making one</h2>
          <p>SHAP values distribute a model prediction across input features using game theory: each feature's average marginal contribution is measured across possible feature subsets. This supports two views:</p>
          <ul>
            <li><strong>Global</strong> — which features best separate higher from lower ranks across the reference corpus.</li>
            <li><strong>Individual</strong> — which exact features push a given profile toward one rank or another, forming the basis of the ML estimate shown on account pages.</li>
          </ul>
          <p>Because XGBoost and Random Forest are both tree models, their SHAP values are averaged. The additive EBM provides an <strong>independent cross-check</strong>; agreement with a black-box model's SHAP makes the interpretation more reliable.</p>
        </section>

        <section class="card legal-card">
          <h2>Model card: metrics, protocol, and negative results</h2>
          <p>A metric without its protocol proves nothing. Both deployed models are evaluated on a <strong>held-out test set</strong>, never optimistic out-of-fold results:</p>
          <div style="overflow-x:auto">
          <table class="readme-table">
            <thead>
              <tr><th>Model</th><th>Unit</th><th>Selection (purged CV on train)</th><th>Held-out test</th></tr>
            </thead>
            <tbody>
              <tr><td>Rank (binary high elo)</td><td>1 player, ≥15 ADC games</td><td>AUC 0.591 (n=687)</td><td><strong>AUC 0.677</strong> (n=147)</td></tr>
              <tr><td>LP regression</td><td>1 apex player</td><td>Spearman 0.493 (n=805)</td><td><strong>Spearman 0.537</strong> (n=170)</td></tr>
            </tbody>
          </table>
          </div>
          <p style="margin-top:10px"><strong>Purged CV.</strong> About 37% of games pair <em>two</em> players from the dataset, creating mirrored features and fold leakage. Training aggregates are recalculated at every fold with those games excluded. Leakage was <strong>measured, not assumed</strong>: approximately +0.005 AUC.</p>
          <p><strong>What the model actually uses.</strong> Dispersion statistics (standard deviation, p10, p90) account for <strong>65%</strong> of the SHAP signal, versus 20% for the mean. Rank is driven by a player's <em>floor</em>, not their average: bad games distinguish players more than good ones.</p>
          <p><strong>Negative results, reported openly.</strong> Hiding them would misrepresent the project:</p>
          <ul>
            <li>Self-supervised mask-and-reconstruct pretraining <strong>adds no value</strong>: −0.019 delta, and −0.025 for a v2 intended to improve it.</li>
            <li>The Master / Grandmaster boundary <strong>tops out around 0.589</strong>: calibration places Master at 0.489 and Grandmaster at 0.487, reversing the expected order. Macro features do not separate these tiers.</li>
            <li>Increasing games per player <strong>does not help beyond roughly 30</strong> (0.635 peak, 0.599 at N=50).</li>
            <li>The per-game model was <strong>deprecated</strong> because it was too unstable to display.</li>
          </ul>
          <p class="faint">Documented limitations: one patch (16.13) and one region (EUW); rank transferred to both lobby ADCs; Grandmaster underrepresented (16 test players), making GM metrics uninterpretable; known drift between the served model and current dataset. Full details are in the <a href="https://github.com/JeanVG23/riftsense/blob/master/docs/MODEL_CARD.md" target="_blank" rel="noopener">model card</a>.</p>
        </section>

        <section class="card legal-card">
          <h2>From score to displayed rank</h2>
          <p>The classifier is binary (high vs low elo), not a direct rank predictor. Calibration maps the ensemble's mean probability to a specific rank by measuring its distribution across real reference ranks, then selecting the closest calibrated rank for the player's latest games. Confidence is always displayed next to the estimate and never presented as certainty.</p>
        </section>
      </div>
    </template>

    <!-- onglet Coaching IA -->
    <template v-if="tab === 'coaching'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>The LLM does not see the game; it explains quantified differences</h2>
          <p>The language model never receives video, raw timelines, or event logs. It receives a <strong>deterministic payload</strong> reduced to the essentials: player features compared with matched reference data. The narrative quality depends on payload quality, consistent with the features-first principle.</p>
        </section>

        <section class="card legal-card">
          <h2>Payload construction — safe features only</h2>
          <p>The payload is assembled from player and reference gold data. It strictly applies the asymmetry contract: only <strong>COACHING_SAFE</strong> positioning features are included, while map depth is explicitly marked <span class="mono">descriptive_only</span> to prevent criticism. Two runs on the same games produce the same content; only the LLM wording may vary.</p>
        </section>

        <section class="card legal-card">
          <h2>The prompt — two cardinal rules</h2>
          <p>The system prompt explicitly encodes the two constraints that govern the project:</p>
          <ul>
            <li><strong>Information asymmetry</strong> — never judge a decision using information the player did not have at the time.</li>
            <li><strong>Quantified evidence required</strong> — every claim must cite a comparative number from the payload. Claims without evidence are rejected.</li>
          </ul>
          <p>The rest of the prompt is written in concise, direct English focused on actionable coaching rather than a statistical report.</p>
        </section>

        <section class="card legal-card">
          <h2>Strictly typed output</h2>
          <p>The LLM does not return free-form text. A Pydantic-validated JSON schema constrains the output:</p>
          <ul>
            <li><span class="mono">strengths[1..3]</span> — 1 to 3 strengths</li>
            <li><span class="mono">mistakes[3]</span> — 3 priority mistakes</li>
            <li><span class="mono">habits[2]</span> — 2 habits to correct</li>
            <li><span class="mono">next_focus[1]</span> — one focus for the next game</li>
            <li><span class="mono">confidence</span> — the model's confidence in its analysis</li>
          </ul>
          <p>Every strength and mistake includes <span class="mono">evidence</span>: the quantified proof that supports it.</p>
          <p>The minimum strength count was reduced from three to one after reviewing feedback: requiring exactly three encouraged vague filler. Mistakes remain fixed at three, and habits at two.</p>
        </section>

        <section class="card legal-card">
          <h2>The model</h2>
          <p>Inference runs through Ollama Cloud with JSON-schema output. The default model was selected through A/B testing of narrative quality across multiple candidates. It can be overridden, but the default is a deliberate choice.</p>
        </section>
      </div>
    </template>

    <!-- onglet Feedback -->
    <template v-if="tab === 'feedback'">
      <div class="legal-sections">
        <section class="card legal-card">
          <h2>Why measure instead of only generating</h2>
          <p>Without a feedback loop, there is no way to know whether the coach improves or merely produces plausible observations. Benchmarked coaching is more verifiable than an absolute LLM opinion only when players and reviewers can rate its usefulness.</p>
        </section>

        <section class="card legal-card">
          <h2>Rate each insight independently</h2>
          <p>Every generated insight—a strength, mistake, habit, or focus—can be rated independently. A single score for an entire review would dilute the signal. Two interfaces write to the same feedback data:</p>
          <ul>
            <li><strong>CLI</strong> — <span class="mono">feedback.py annotate --player X</span> walks through persisted insights and asks useful / incorrect / skip, with an optional note.</li>
            <li><strong>Web</strong> — a ✓/✗ control under every review item, plus an optional note field, sent to the same endpoint as the CLI.</li>
          </ul>
        </section>

        <section class="card legal-card">
          <h2>Tags, notes, and why both matter</h2>
          <p>A negative rating requires one tag from a fixed list: <em>hidden information</em>, <em>invented statistic</em>, <em>misread map depth</em>, <em>too vague</em>, <em>not actionable</em>, or <em>other</em>. A tag says <strong>what</strong> failed; the free-form note explains <strong>why</strong>, guiding prompt or feature corrections without guesswork.</p>
        </section>

        <section class="card legal-card">
          <h2>A quantified, published success criterion</h2>
          <p>The loop has value only with a threshold chosen <strong>before</strong> seeing results: <strong>at least 70% of mistakes rated useful across at least 10 rated game analyses</strong>. The metric uses per-game mistakes because they are verifiable moment by moment. The current rate is always shown in the Coaching tab, whether or not the target is met. Every persisted analysis also records prompt version, model, latency, and token usage.</p>
        </section>

        <section class="card legal-card">
          <h2>What aggregation reveals</h2>
          <p>The feedback summary calculates usefulness by section, most frequent tags, and results by LLM model, enabling objective comparisons on the same player. Trends based on fewer than ten ratings are explicitly flagged, and up to two note excerpts per tag preserve nuance that a percentage would erase.</p>
        </section>
      </div>
    </template>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Back to home</a>
      <a href="/terms" class="btn btn-secondary" @click.prevent="goTerms">Terms of Use</a>
      <a href="/privacy" class="btn btn-secondary" @click.prevent="goPrivacy">Privacy Policy →</a>
    </div>
  </div>
</template>

<style scoped>
.legal-page,
.readme {
  position: relative;
  width: 100%;
  max-width: 100%;
  margin: 0 0 60px;
  padding: 0;
  isolation: isolate;
}

/* Tous les contenus de la page méthodologie passent au-dessus des ornements */
.legal-page.readme > *:not(.readme-side-artefacts):not(.readme-targon-backdrop) {
  position: relative;
  z-index: 2;
}

/* Toile de fond unboxed pour la page méthodologie */
.readme-targon-backdrop {
  position: absolute;
  top: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  height: 580px;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  mask-image: radial-gradient(ellipse 85% 65% at 50% 25%, black 25%, transparent 85%),
              linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 85% 65% at 50% 25%, black 25%, transparent 85%),
                      linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

.readme-stone-layer {
  position: absolute;
  inset: 0;
  background: url('/images/targon/grave-dans-la-pierre.jpg') center 20% / cover no-repeat;
  opacity: 0.13;
  mix-blend-mode: multiply;
  filter: contrast(1.2) sepia(0.25);
}

.readme-observatory-layer {
  position: absolute;
  inset: 0;
  background: url('/images/targon/observatoire-zenith.jpg') center 15% / cover no-repeat;
  opacity: 0.20;
  mix-blend-mode: multiply;
  filter: contrast(1.15) saturate(1.1);
}

/* Artefacts de bordure latérale spécifiques à la méthodologie */
.readme-side-artefacts {
  top: 360px;
}

.readme-artefact--astrolabe {
  top: 30px;
  left: max(10px, calc(50% - 690px));
  width: 320px;
  height: 320px;
  background: url('/images/targon/astrolabe-or.jpg') center / contain no-repeat;
  opacity: 0.17;
  mask-image: radial-gradient(circle at center, black 32%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle at center, black 32%, transparent 75%);
  filter: contrast(1.15) drop-shadow(0 0 35px rgba(185, 143, 83, 0.30));
}

.readme-artefact--lunaris {
  top: 490px;
  right: max(10px, calc(50% - 710px));
  width: 340px;
  height: 420px;
  background: url('/images/targon/lunaris.jpg') center / contain no-repeat;
  opacity: 0.16;
  mask-image: radial-gradient(circle at center, black 28%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle at center, black 28%, transparent 75%);
  filter: contrast(1.15) drop-shadow(0 0 35px rgba(62, 109, 140, 0.25));
}

.readme-artefact--outil {
  top: 980px;
  left: max(15px, calc(50% - 680px));
  width: 320px;
  height: 340px;
  background: url('/images/targon/outil-escalade.jpg') center / contain no-repeat;
  opacity: 0.15;
  mask-image: radial-gradient(ellipse 65% 80% at center, black 25%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 65% 80% at center, black 25%, transparent 80%);
  filter: contrast(1.12);
}

@media (max-width: 1200px) {
  .readme-artefact--astrolabe { opacity: 0.10; left: -30px; }
  .readme-artefact--lunaris { opacity: 0.10; right: -30px; }
  .readme-artefact--outil { display: none; }
}

.legal-header {
  position: relative;
  z-index: 1;
  margin-bottom: 24px;
}

.legal-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-faint);
  margin-bottom: 12px;
}

.legal-breadcrumbs a {
  color: var(--text-dim);
  text-decoration: none;
  transition: color 0.15s;
}

.legal-breadcrumbs a:hover {
  color: var(--primary);
}

.legal-breadcrumbs .current {
  color: var(--primary);
  font-weight: 600;
}

.legal-sep {
  color: var(--text-faint);
  opacity: 0.5;
}

.legal-title {
  font-size: clamp(28px, 4vw, 38px);
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
  margin: 0 0 10px;
  line-height: 1.2;
}

.legal-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-dim);
  flex-wrap: wrap;
  margin: 0 0 14px;
}

.badge-legal {
  background: var(--primary-soft);
  color: var(--primary);
  border: 1px solid var(--primary-border);
  font-weight: 650;
  font-size: 11.5px;
  padding: 2.5px 9px;
  border-radius: 999px;
}

.legal-subline {
  font-size: 15px;
  color: var(--text-dim);
  line-height: 1.65;
  margin: 0 0 24px;
  max-width: 100%;
}

.legal-subline strong {
  color: var(--text);
  font-weight: 680;
}

.tabs {
  margin: 10px 0 26px;
  width: 100%;
}

.legal-sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 36px;
  width: 100%;
}

.legal-card {
  padding: 24px 28px;
  border-radius: 12px;
  background: var(--card-surface-gradient);
  border: 1px solid var(--border-soft);
  box-shadow: var(--card-shadow);
  margin: 0;
  width: 100%;
  box-sizing: border-box;
  transition: var(--transition-base);
}

.legal-card:hover {
  border-color: rgba(185, 143, 83, 0.42);
  box-shadow: var(--card-shadow-hover);
  transform: translateY(-1px);
}

.legal-card + .legal-card {
  margin-top: 0;
}

.legal-card h2 {
  font-size: 19px;
  font-weight: 750;
  color: var(--text);
  margin: 0 0 12px;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.legal-card p {
  font-size: 14.5px;
  color: var(--text-dim);
  line-height: 1.7;
  margin: 0 0 12px;
}

.legal-card p:last-child {
  margin-bottom: 0;
}

.legal-card ul,
.legal-card ol {
  margin: 0 0 12px;
  padding-left: 22px;
  color: var(--text-dim);
  font-size: 14.5px;
  line-height: 1.7;
}

.legal-card li {
  margin: 6px 0;
  line-height: 1.65;
}

.legal-card strong {
  color: var(--text);
  font-weight: 650;
}

.legal-card em {
  color: var(--primary);
  font-style: normal;
  font-weight: 600;
}

.legal-card code,
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--primary);
}

.legal-card a {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.readme-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  margin: 14px 0;
}

.readme-table th,
.readme-table td {
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: top;
}

.readme-table th {
  color: var(--text-faint);
  font-weight: 700;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-alt);
}

.readme-table tr:last-child td {
  border-bottom: none;
}

.legal-footer-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--border-soft);
  width: 100%;
}

.legal-footer-nav .btn-secondary {
  color: var(--text-dim);
  background: var(--panel-2);
  border: 1px solid var(--border-soft);
  text-decoration: none;
}

.legal-footer-nav .btn-secondary:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--panel-hover);
  text-decoration: none;
}

/* Visual editorial band */
.legal-visual-band {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  min-height: 116px;
  margin-bottom: 22px;
  padding: 22px 32px;
  border: 1.5px solid rgba(195, 160, 110, 0.45);
  border-radius: 14px;
  background:
    linear-gradient(95deg, rgba(255, 253, 248, .98) 0%, rgba(255, 253, 248, .92) 52%, rgba(247, 244, 237, .35) 100%),
    url('/images/targon/observatoire-zenith.jpg') right 12% center / cover no-repeat;
  box-shadow:
    0 4px 18px rgba(20, 23, 24, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  transition: var(--transition-base);
}

.legal-visual-band:hover {
  border-color: rgba(185, 143, 83, 0.65);
  box-shadow:
    0 8px 24px rgba(185, 143, 83, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 1);
}

.legal-visual-copy {
  position: relative;
  z-index: 1;
  max-width: 660px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legal-visual-title {
  margin: 0;
  color: var(--ink);
  font-size: clamp(20px, 2.2vw, 24px);
  line-height: 1.25;
  letter-spacing: -.025em;
  font-weight: 760;
}

.legal-visual-sub {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.55;
}

@media (max-width: 860px) {
  .readme-table {
    min-width: 620px;
  }
  .legal-visual-band {
    min-height: auto;
    padding: 18px 20px;
  }
  .legal-card {
    padding: 18px 20px;
  }
  .legal-footer-nav {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .legal-footer-nav .btn {
    width: 100%;
    text-align: center;
    justify-content: center;
  }
}
</style>
