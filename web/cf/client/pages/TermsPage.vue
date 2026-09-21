<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function goHome(): void {
  void router.push("/");
}
</script>

<template>
  <div class="legal-page">
    <!-- Artefacts sacrés & gravures de lois sur les flancs -->
    <div class="terms-side-artefacts page-side-artefacts" aria-hidden="true">
      <div class="side-artefact-item terms-artefact--stele"></div>
      <div class="side-artefact-item terms-artefact--pierre"></div>
    </div>

    <div class="legal-header">
      <div class="legal-breadcrumbs">
        <a href="/" @click.prevent="goHome">Home</a>
        <span class="legal-sep">/</span>
        <span class="current">Terms of Use</span>
      </div>
      <h1 class="legal-title">Terms of Use</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Legal</span>
        <span>Last updated: March 2026</span>
        <span class="legal-sep">·</span>
        <span>Compliant with Riot Developer Policies</span>
      </p>
    </div>

    <!-- Séparateur céleste Targon -->
    <div class="celestial-divider" aria-hidden="true">
      <span class="divider-line"></span>
      <span class="divider-gem">✦</span>
      <span class="divider-line"></span>
    </div>

    <!-- Bannière Riot Games Disclaimer -->
    <div class="card legal-disclaimer-card">
      <div class="legal-disclaimer-inner">
        <div class="legal-disclaimer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="2"/>
            <line x1="12" y1="8" x2="12" y2="12" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="var(--primary)"/>
          </svg>
        </div>
        <div class="legal-disclaimer-content">
          <strong>Official Riot Games Legal Disclaimer</strong>
          <p class="legal-quote">
            “RiftSense isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.”
          </p>
        </div>
      </div>
    </div>

    <!-- Executive Summary for Riot Reviewers -->
    <div class="card legal-card legal-reviewer-box">
      <div class="legal-reviewer-badge">Developer Compliance Summary</div>
      <p class="legal-reviewer-text">
        <strong>RiftSense</strong> is a personal, non-commercial educational project providing post-match statistical analysis, position timeline metrics, and explainable machine learning models (EBM &amp; SHAP) for League of Legends players.
      </p>
      <ul class="legal-reviewer-list">
        <li><strong>Zero Real-Time Assistance:</strong> Operates strictly post-match using official Match-V5 and Account-V1 APIs. No live game overlays, no memory reading, no automated gameplay interference.</li>
        <li><strong>Non-Commercial &amp; Free:</strong> Completely free public access. No paid subscriptions, no paywalling of Riot data.</li>
        <li><strong>Privacy &amp; Data Rights:</strong> No Riot account credentials or emails collected. Immediate data deletion upon request at <code>contact@jeanvg.fr</code>.</li>
      </ul>
    </div>

    <div class="legal-sections">
      <!-- Section 1 -->
      <section class="card legal-card" id="objet">
        <h2>1. Service Overview, Purpose &amp; Acceptance</h2>
        <p>
          <strong>RiftSense</strong> (available at <code>riftsense.jeanvg.fr</code>) is a web service providing retrospective statistical analysis, explainable machine learning (SHAP / EBM), and post-game coaching for <em>League of Legends</em> players.
        </p>
        <p>
          Accessing and using RiftSense constitutes full acceptance of these Terms of Use. Users acknowledge that they have read these rules before viewing or synchronizing a profile.
        </p>
      </section>

      <!-- Section 2 -->
      <section class="card legal-card" id="riot-policy">
        <h2>2. Riot Games Policy &amp; API Compliance</h2>
        <p>
          RiftSense is developed and operated in strict accordance with the <a href="https://developer.riotgames.com/policies/general" target="_blank" rel="noopener">Riot Games Developer Policies</a> and <a href="https://developer.riotgames.com/terms" target="_blank" rel="noopener">Riot Games API Terms and Conditions</a>.
        </p>
        <ul>
          <li>RiftSense exclusively uses official Riot Games API endpoints (Match-V5, Account-V1, League-V4).</li>
          <li>RiftSense respects Riot Games rate limits and uses backoff when it receives an HTTP 429 response.</li>
          <li>RiftSense never encourages users to bypass technical limits set by Riot Games.</li>
        </ul>
      </section>

      <!-- Section 3 -->
      <section class="card legal-card" id="fair-play">
        <h2>3. Post-Game Analysis &amp; Fair Play (Zero Real-Time Gameplay Assistance)</h2>
        <p>
          RiftSense is designed to promote improvement and fair learning on Summoner's Rift:
        </p>
        <ul>
          <li><strong>Strictly post-game:</strong> All positioning, laning, and decision-making analyses rely exclusively on timelines from completed games (Match-V5 Timeline).</li>
          <li><strong>Zero live assistance:</strong> RiftSense does not interact with a running game client, read game memory during a match, or provide overlays, dynamic HUDs, or real-time decision assistance.</li>
          <li><strong>Information asymmetry respected:</strong> RiftSense never criticizes a player for an action based on information hidden by fog of war at the time.</li>
        </ul>
      </section>

      <!-- Section 4 -->
      <section class="card legal-card" id="access">
        <h2>4. Free, Personal, Non-Commercial Use</h2>
        <p>
          RiftSense is an independent educational and personal project. Access and use are limited to <strong>personal, non-commercial purposes</strong>:
        </p>
        <ul>
          <li>All public features—player search, game history, macro metrics, ML rank estimates, and SHAP visualizations—are available <strong>free of charge</strong>.</li>
          <li>No Riot Games API data is sold, rented, or placed behind a mandatory paywall.</li>
          <li>Large-scale automated extraction, data resale, and commercial use without written permission are prohibited.</li>
        </ul>
        <p>
          The service is provided “AS IS” and subject to availability. The publisher takes reasonable steps to maintain access but cannot guarantee uninterrupted service during maintenance, Cloudflare incidents, or temporary Riot Games API outages.
        </p>
      </section>

      <!-- Section 5 -->
      <section class="card legal-card" id="propriete">
        <h2>5. Intellectual Property</h2>
        <p>
          <strong>Riot Games assets:</strong> League of Legends, artwork, logos, summoner icons, champion portraits, and game statistics are the exclusive property of Riot Games, Inc.
        </p>
        <p>
          <strong>RiftSense assets:</strong> The original source code, Cloudflare Workers serverless architecture, predictive models (EBM / Random Forest / XGBoost), and user interface belong to the RiftSense author and are released under the MIT license in the <a href="https://github.com/JeanVG23/riftsense" target="_blank" rel="noopener">official GitHub repository</a>.
        </p>
      </section>

      <!-- Section 6 -->
      <section class="card legal-card" id="responsabilite">
        <h2>6. Limitation of Liability &amp; “AS IS” Clause</h2>
        <p>
          <strong>No gameplay performance guarantee:</strong> Rank estimates and strategic advice are provided solely for statistical and educational purposes. RiftSense makes no promise or guarantee about win rate, League Point gains, or rank promotion.
        </p>
        <p>
          <strong>Failures and outages:</strong> The publisher is not liable for malfunctions, disconnections, data loss, or errors caused by network providers, third-party browsers, or temporary Riot Games service interruptions.
        </p>
      </section>

      <!-- Section 7 -->
      <section class="card legal-card" id="contact">
        <h2>7. Contact &amp; Reporting Issues</h2>
        <p>
          For questions about these Terms of Use or to report an issue, contact us:
        </p>
        <ul>
          <li>By email: <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a></li>
          <li>On GitHub: <a href="https://github.com/JeanVG23/riftsense/issues" target="_blank" rel="noopener">github.com/JeanVG23/riftsense/issues</a></li>
        </ul>
      </section>
    </div>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Back to home</a>
      <a href="/readme" class="btn btn-secondary" @click.prevent="router.push('/readme')">About &amp; Method</a>
      <a href="/privacy" class="btn btn-secondary" @click.prevent="router.push('/privacy')">Privacy Policy →</a>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  position: relative;
  width: 100%;
  max-width: 100%;
  margin: 0 0 60px;
  padding: 0;
  isolation: isolate;
}

/* Tous les contenus de la page légale passent au-dessus des ornements */
.legal-page > *:not(.terms-side-artefacts) {
  position: relative;
  z-index: 2;
}

.terms-side-artefacts {
  top: 100px;
  z-index: 0;
}

.terms-artefact--stele {
  top: 40px;
  left: max(10px, calc(50% - 730px));
  width: 320px;
  height: 440px;
  background: url('/images/targon/stele-targon.jpg') center / contain no-repeat;
  opacity: 0.09;
  mix-blend-mode: multiply;
  mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  filter: contrast(1.12);
}

.terms-artefact--pierre {
  top: 560px;
  right: max(10px, calc(50% - 730px));
  width: 320px;
  height: 380px;
  background: url('/images/targon/grave-dans-la-pierre.jpg') center / contain no-repeat;
  opacity: 0.09;
  mix-blend-mode: multiply;
  mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  filter: contrast(1.15) sepia(0.2);
}

@media (max-width: 1200px) {
  .terms-artefact--stele { opacity: 0.08; left: -30px; }
  .terms-artefact--pierre { opacity: 0.08; right: -30px; }
}

.legal-header {
  position: relative;
  z-index: 1;
  margin-bottom: 12px;
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

.legal-disclaimer-card {
  border: 1.5px solid rgba(195, 160, 110, 0.45);
  background: linear-gradient(135deg, rgba(255, 253, 248, 0.98) 0%, rgba(247, 244, 237, 0.92) 100%);
  box-shadow: 0 4px 18px rgba(20, 23, 24, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95);
  margin-bottom: 24px;
  padding: 24px 28px;
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  transition: var(--transition-base);
}

.legal-disclaimer-card:hover {
  border-color: rgba(185, 143, 83, 0.65);
  box-shadow: 0 6px 24px rgba(185, 143, 83, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1);
}

.legal-disclaimer-inner {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.legal-disclaimer-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.legal-disclaimer-content strong {
  display: block;
  font-size: 14.5px;
  color: var(--text);
  margin-bottom: 6px;
}

.legal-quote {
  font-style: italic;
  color: var(--text-dim);
  font-size: 13.5px;
  line-height: 1.65;
  margin: 0;
}

.legal-reviewer-box {
  border: 1.5px solid rgba(195, 160, 110, 0.40);
  background: var(--surface-alt);
  box-shadow: 0 2px 10px rgba(20, 23, 24, 0.04);
  margin-bottom: 24px;
  padding: 24px 28px;
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  transition: var(--transition-base);
}

.legal-reviewer-box:hover {
  border-color: rgba(185, 143, 83, 0.55);
}

.legal-reviewer-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 3px 8px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.legal-reviewer-text {
  font-size: 14px;
  color: var(--text);
  line-height: 1.65;
  margin: 0 0 10px;
}

.legal-reviewer-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13.5px;
  color: var(--text-dim);
  line-height: 1.65;
}

.legal-reviewer-list li {
  margin: 6px 0;
}

.legal-reviewer-list strong {
  color: var(--text);
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
  border-color: rgba(185, 143, 83, 0.40);
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

.legal-subheading {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  margin: 18px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.legal-card code {
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

@media (max-width: 860px) {
  .legal-card,
  .legal-disclaimer-card,
  .legal-reviewer-box {
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
