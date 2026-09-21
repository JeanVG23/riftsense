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
    <div class="privacy-side-artefacts page-side-artefacts" aria-hidden="true">
      <div class="side-artefact-item privacy-artefact--pierre"></div>
      <div class="side-artefact-item privacy-artefact--stele"></div>
    </div>

    <div class="legal-header">
      <div class="legal-breadcrumbs">
        <a href="/" @click.prevent="goHome">Home</a>
        <span class="legal-sep">/</span>
        <span class="current">Privacy Policy</span>
      </div>
      <h1 class="legal-title">Privacy Policy</h1>
      <p class="legal-meta">
        <span class="badge badge-legal">Data protection</span>
        <span>Last updated: March 2026</span>
        <span class="legal-sep">·</span>
        <span>GDPR (EU 2016/679) &amp; Riot API compliant</span>
      </p>
    </div>

    <!-- Séparateur céleste Targon -->
    <div class="celestial-divider" aria-hidden="true">
      <span class="divider-line"></span>
      <span class="divider-gem">✦</span>
      <span class="divider-line"></span>
    </div>

    <!-- Bannière Engagement de Confidentialité -->
    <div class="card legal-disclaimer-card privacy-accent">
      <div class="legal-disclaimer-inner">
        <div class="legal-disclaimer-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="var(--primary)" stroke-width="2" fill="var(--info-soft)"/>
            <path d="M9 12l2 2 4-4" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="legal-disclaimer-content">
          <strong>Our commitment to transparency and data minimization</strong>
          <p>
            RiftSense only processes public game statistics provided by the Riot Games API. We <strong>never</strong> request your password, payment information, or private Riot account credentials.
          </p>
        </div>
      </div>
    </div>

    <!-- Executive Summary for Riot Reviewers -->
    <div class="card legal-card legal-reviewer-box">
      <div class="legal-reviewer-badge">Privacy &amp; Compliance Summary</div>
      <p class="legal-reviewer-text">
        <strong>RiftSense</strong> complies with the European General Data Protection Regulation (GDPR) and Riot Games Developer Policies.
      </p>
      <ul class="legal-reviewer-list">
        <li><strong>Data Sources:</strong> Only publicly available match data provided by Riot Games official endpoints (PUUID, Match-V5, Account-V1, League-V4) and local device cache.</li>
        <li><strong>Data Exclusions:</strong> Zero account passwords, zero Riot email addresses, zero payment details, zero commercial tracking cookies.</li>
        <li><strong>User Rights:</strong> Full right of access, rectification, and erasure. Players can request immediate cache deletion by emailing <code>contact@jeanvg.fr</code> (processed within 48h).</li>
      </ul>
    </div>

    <div class="legal-sections">
      <!-- Section 1 -->
      <section class="card legal-card" id="responsable">
        <h2>1. Data Controller</h2>
        <p>
          The data controller for <strong>RiftSense</strong> (<code>riftsense.jeanvg.fr</code>) is:
        </p>
        <p>
          <strong>Jean Van Gysel</strong><br>
          Contact email: <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a>
        </p>
      </section>

      <!-- Section 2 -->
      <section class="card legal-card" id="donnees-collectees">
        <h2>2. Data We Process and Its Sources</h2>
        <p>RiftSense processes two limited categories of data:</p>

        <h3 class="legal-subheading">A. Public game data (through the official Riot Games API)</h3>
        <ul>
          <li><strong>Public Riot ID:</strong> Game name and tag line (for example, <code>Spadzze#EUW</code>).</li>
          <li><strong>Pseudonymous technical identifier:</strong> The PUUID assigned by Riot Games.</li>
          <li><strong>Ranked game history:</strong> Match IDs from the Solo/Duo queue.</li>
          <li><strong>Game metrics:</strong> Timestamped map positions (every 60 seconds), champions played, KDA, CS, accumulated gold, purchased items, wards, and runes.</li>
        </ul>

        <h3 class="legal-subheading">B. Local browsing data (on your device)</h3>
        <ul>
          <li><strong>Recent viewing history:</strong> Stored only in your browser's <code>localStorage</code> (key <code>riftsense_recent_accounts</code>). This data remains on your device and is never shared with third parties.</li>
          <li><strong>Optional coaching session:</strong> When applicable, an encrypted session token in <code>localStorage</code> (key <code>riftsense_coach_pwd</code>) grants access to detailed match reviews.</li>
        </ul>
      </section>

      <!-- Section 3 -->
      <section class="card legal-card" id="donnees-exclues">
        <h2>3. Data We Explicitly Exclude</h2>
        <p>RiftSense does <strong>not</strong> collect, store, or process any of the following:</p>
        <ul>
          <li><strong>No passwords</strong> or Riot Games login credentials.</li>
          <li><strong>No email addresses</strong> associated with Riot accounts.</li>
          <li><strong>No payment, billing, or banking information.</strong></li>
          <li><strong>No private communications</strong>, including in-game messages, friends lists, text chat, or voice chat.</li>
          <li><strong>No advertising cookies</strong> or third-party analytics trackers such as Google Analytics or Facebook Pixel.</li>
        </ul>
      </section>

      <!-- Section 4 -->
      <section class="card legal-card" id="finalites">
        <h2>4. Purposes and Legal Basis</h2>
        <p>Data is processed on the basis of legitimate interest (GDPR Art. 6(1)(f)) for the following purposes:</p>
        <ul>
          <li>Display performance statistics and recent game history.</li>
          <li>Calculate positioning indicators such as lane patterns, avoidable deaths, and objective presence.</li>
          <li>Run SHAP explainability and estimate rank with machine learning (EBM / XGBoost).</li>
          <li>Generate educational post-game feedback through automated coaching.</li>
        </ul>
      </section>

      <!-- Section 5 -->
      <section class="card legal-card" id="decision-automatique">
        <h2>5. Automated Processing and Machine Learning (GDPR Art. 22)</h2>
        <p>
          RiftSense uses machine-learning algorithms (Explainable Boosting Machine and SHAP values) to estimate a player's competitive rank and statistically explain strengths and improvement areas.
        </p>
        <p>
          This processing is <strong>purely informational, statistical, and educational</strong>. It does not make fully automated decisions with legal or similarly significant effects under GDPR Article 22. Full details of the training and evaluation protocol are publicly available under <a href="/readme" @click.prevent="router.push('/readme')">About &amp; Method</a>.
        </p>
      </section>

      <!-- Section 6 -->
      <section class="card legal-card" id="sous-traitants">
        <h2>6. Hosting and Processors</h2>
        <p>RiftSense relies on established infrastructure providers:</p>
        <ul>
          <li><strong>Cloudflare Inc.:</strong> Serverless edge hosting (Cloudflare Workers), CDN, encrypted caching (Cloudflare KV), and object storage (Cloudflare R2), under applicable EU standard contractual clauses.</li>
          <li><strong>Riot Games, Inc.:</strong> Source provider for public match data through the developer API.</li>
        </ul>
      </section>

      <!-- Section 7 -->
      <section class="card legal-card" id="duree">
        <h2>7. Data Retention</h2>
        <ul>
          <li><strong>Game data:</strong> Cached for no longer than the current competitive season, or periodically invalidated during major League of Legends patches.</li>
          <li><strong>Local browsing data:</strong> Kept in your browser until you clear browsing data or remove it through the site interface.</li>
        </ul>
      </section>

      <!-- Section 8 -->
      <section class="card legal-card" id="droits">
        <h2>8. Your GDPR Rights &amp; Right to Erasure</h2>
        <p>
          Under the General Data Protection Regulation (GDPR), you have the following rights:
        </p>
        <ul>
          <li><strong>Access and information:</strong> Request confirmation that data concerning you is being processed.</li>
          <li><strong>Erasure (“right to be forgotten”):</strong> To permanently remove your Riot ID and associated game data from the RiftSense cache, email <a href="mailto:contact@jeanvg.fr">contact@jeanvg.fr</a> with your Riot ID (for example, <code>Name#Tag</code>). The profile will be removed within 48 business hours.</li>
          <li><strong>Immediate removal of local data:</strong> Remove an account from recent profiles by clicking <code>×</code> in the player selector, or clear your browser storage.</li>
        </ul>
      </section>

      <!-- Section 9 -->
      <section class="card legal-card" id="reclamation">
        <h2>9. Complaints to a Supervisory Authority</h2>
        <p>
          If, after contacting us, you believe your rights have not been respected, you may lodge a complaint with the <strong>CNIL</strong>, the French data protection authority (<a href="https://www.cnil.fr" target="_blank" rel="noopener">cnil.fr</a>), or your local supervisory authority.
        </p>
      </section>
    </div>

    <div class="legal-footer-nav">
      <a href="/" class="btn btn-secondary" @click.prevent="goHome">← Back to home</a>
      <a href="/readme" class="btn btn-secondary" @click.prevent="router.push('/readme')">About &amp; Method</a>
      <a href="/terms" class="btn btn-secondary" @click.prevent="router.push('/terms')">Terms of Use →</a>
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

/* Tous les contenus de la page confidentialité passent au-dessus des ornements */
.legal-page > *:not(.privacy-side-artefacts) {
  position: relative;
  z-index: 2;
}

.privacy-side-artefacts {
  top: 100px;
  z-index: 0;
}

.privacy-artefact--pierre {
  top: 40px;
  left: max(10px, calc(50% - 730px));
  width: 320px;
  height: 380px;
  background: url('/images/targon/grave-dans-la-pierre.jpg') center / contain no-repeat;
  opacity: 0.09;
  mix-blend-mode: multiply;
  mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  filter: contrast(1.15) sepia(0.2);
}

.privacy-artefact--stele {
  top: 560px;
  right: max(10px, calc(50% - 730px));
  width: 320px;
  height: 440px;
  background: url('/images/targon/stele-targon.jpg') center / contain no-repeat;
  opacity: 0.09;
  mix-blend-mode: multiply;
  mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
  filter: contrast(1.12);
}

@media (max-width: 1200px) {
  .privacy-artefact--pierre { opacity: 0.08; left: -30px; }
  .privacy-artefact--stele { opacity: 0.08; right: -30px; }
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
  background: var(--surface-alt);
  margin-bottom: 24px;
  padding: 24px 28px;
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  transition: var(--transition-base);
}

.legal-disclaimer-card.privacy-accent {
  border-color: rgba(87, 116, 93, 0.40);
  background: linear-gradient(135deg, rgba(255, 253, 248, 0.98) 0%, rgba(244, 248, 245, 0.92) 100%);
  box-shadow: 0 4px 18px rgba(20, 23, 24, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.legal-disclaimer-card.privacy-accent:hover {
  border-color: rgba(87, 116, 93, 0.65);
  box-shadow: 0 6px 22px rgba(87, 116, 93, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1);
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
