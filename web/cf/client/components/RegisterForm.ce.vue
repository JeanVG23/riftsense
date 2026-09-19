<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  navigateTo,
  REGISTER_ERRORS,
  RIOT_PLATFORMS,
  useAccountRegistration,
  type RegistrationResponse,
  type RegistrationState,
} from "../account-registration";
import { RECENT_ACCOUNTS_CHANGED, rememberRecentAccount } from "../recent-accounts";

const props = withDefaults(defineProps<{ mode?: "form" | "status" }>(), {
  mode: "form",
});

const MAX_NETWORK_RETRIES = 5;

const { riotId, platform, submitting, error, submitRegistration } = useAccountRegistration();

const state = ref<RegistrationState | null>(null);
const position = ref<number | null>(null);
const slug = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let networkFailures = 0;
let stopped = false;

function stopPolling() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  stopped = true;
}

function poll() {
  if (stopped) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(refresh, 3000);
}

async function submit() {
  await submitRegistration();
}

async function refresh() {
  if (!slug.value || stopped) return;
  let response: Response;
  try {
    response = await fetch(`/api/register/${encodeURIComponent(slug.value)}/status`);
  } catch {
    networkFailures += 1;
    if (networkFailures >= MAX_NETWORK_RETRIES) {
      state.value = "error";
      error.value = REGISTER_ERRORS.internal;
      return;
    }
    poll();
    return;
  }

  networkFailures = 0;
  const body = await response.json().catch(() => ({})) as RegistrationResponse;
  if (!response.ok) {
    state.value = "error";
    error.value = body.detail || REGISTER_ERRORS.internal;
    return;
  }
  if (body.state === "error") {
    state.value = "error";
    error.value = REGISTER_ERRORS[body.error_code || ""] || REGISTER_ERRORS.internal;
    return;
  }
  if (body.state === "done") {
    state.value = "done";
    if (slug.value) {
      rememberRecentAccount({
        slug: slug.value,
        riot_id: riotId.value || slug.value,
        region: platform.value || "euw1",
        games_count: body.n_games ?? 20,
      });
      window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
    }
    navigateTo(`/c/${slug.value}`);
    return;
  }
  if (body.state !== "queued" && body.state !== "running") {
    state.value = "error";
    error.value = REGISTER_ERRORS.internal;
    return;
  }
  state.value = body.state;
  position.value = body.position ?? null;
  poll();
}

function backToForm() {
  stopPolling();
  navigateTo("/");
}

onMounted(() => {
  if (props.mode !== "status") return;
  const match = location.pathname.match(/^\/register\/([^/]+)$/);
  if (!match) {
    state.value = "error";
    error.value = REGISTER_ERRORS.internal;
    return;
  }
  slug.value = decodeURIComponent(match[1]);
  state.value = "queued";
  void refresh();
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <div v-if="mode === 'form'" class="register-hero-widget">
    <form class="register-bar-form" @submit.prevent="submit">
      <div class="register-bar-inputs">
        <label class="field-label register-label-riot" for="riot-id">
          <span>Riot ID</span>
          <div class="input-with-icon">
            <svg class="input-icon" viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
            </svg>
            <input id="riot-id" v-model="riotId" class="input register-input-id" placeholder="Invocateur#TAG (ex: Spadzze#euw)" required>
          </div>
        </label>
        <label class="field-label register-label-server" for="platform">
          <span>Serveur</span>
          <select id="platform" v-model="platform" class="select register-select-server">
            <option v-for="p in RIOT_PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary register-submit-btn" :disabled="submitting || !riotId">
          <span v-if="submitting" class="loading-spinner-inline" aria-hidden="true"></span>
          <span>{{ submitting ? "Collecte…" : "Analyser mes parties" }}</span>
          <span v-if="!submitting" class="register-btn-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </form>
    <p v-if="error" class="state err register-err-msg">{{ error }}</p>
  </div>

  <div v-else class="page-intro home-intro register-status-view">
    <div class="hero-live-pill" :class="{ 'hero-live-pill--error': state === 'error' }">
      <span class="live-indicator-dot" :class="{ 'dot--error': state === 'error' }"></span>
      <span class="hero-live-text">
        {{ state === "error" ? "ERREUR DE SYNCHRONISATION" : "SYNCHRONISATION RIOT GAMES" }}
      </span>
    </div>

    <h1 class="status-title">
      <span v-if="state === 'error'" class="text-danger">Analyse impossible</span>
      <span v-else class="text-ink">Analyse de ton compte en cours</span>
    </h1>

    <p class="status-subtitle muted">
      {{ state === "error"
        ? "La récupération des données auprès de l'API Riot Games n'a pas pu aboutir."
        : "Connexion sécurisée à l'API Riot Games et extraction de tes 20 dernières parties Solo/Duo." }}
    </p>

    <div class="card status-progress-card" :class="{ 'card--error': state === 'error' }">
      <!-- Stepper à 3 étapes -->
      <div class="status-stepper" aria-label="Progression de l'analyse">
        <div class="status-step" :class="{
          active: state === 'queued' || state === 'running',
          done: state === 'done',
          error: state === 'error'
        }">
          <span class="step-num">
            <span v-if="state === 'error'">✕</span>
            <span v-else-if="state === 'done'">✓</span>
            <span v-else>1</span>
          </span>
          <span class="step-label">Riot ID</span>
        </div>

        <div class="step-sep" :class="{ active: state === 'running' || state === 'done' }"></div>

        <div class="status-step" :class="{
          active: state === 'running',
          done: state === 'done'
        }">
          <span class="step-num">
            <span v-if="state === 'done'">✓</span>
            <span v-else>2</span>
          </span>
          <span class="step-label">20 parties SoloQ</span>
        </div>

        <div class="step-sep" :class="{ active: state === 'done' }"></div>

        <div class="status-step" :class="{ done: state === 'done' }">
          <span class="step-num">
            <span v-if="state === 'done'">✓</span>
            <span v-else>3</span>
          </span>
          <span class="step-label">Profil ML &amp; SHAP</span>
        </div>
      </div>

      <!-- État d'erreur -->
      <div v-if="state === 'error'" class="status-error-box">
        <div class="status-error-header">
          <span class="status-error-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </span>
          <div class="status-error-content">
            <div class="status-error-heading">Compte introuvable ou inaccessible</div>
            <p class="status-error-message">{{ error }}</p>
          </div>
        </div>

        <div class="status-error-tips">
          <div class="tip-title">Conseils pour corriger la saisie :</div>
          <ul class="tip-list">
            <li>Vérifie que l'orthographe et la casse correspondent à ton Riot ID en jeu.</li>
            <li>Assure-toi d'inclure le tag complet (ex : <code>MonPseudo#EUW</code>).</li>
            <li>Vérifie que le serveur sélectionné correspond bien à la région de ton compte.</li>
          </ul>
        </div>

        <div class="status-actions-row">
          <a class="btn btn-primary status-action-btn" href="/" @click.prevent="backToForm">
            <span class="btn-arrow-left" aria-hidden="true">←</span>
            <span>Revenir au formulaire</span>
          </a>
          <a class="btn status-secondary-btn" href="/c/spadzze">
            <span>Explorer la démo (Spadzze)</span>
            <span class="btn-arrow-right" aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <!-- État en cours (queued ou running) -->
      <div v-else class="status-loading-box">
        <div class="status-progress-bar-wrap">
          <div class="status-progress-bar" :class="{ indeterminate: state === 'running' }"></div>
        </div>

        <div class="status-desc-wrap">
          <p v-if="state === 'queued'" class="status-step-msg">
            <span class="loading-spinner-inline" aria-hidden="true"></span>
            <span>En file d'attente auprès du service d'ingestion<span v-if="position"> (position {{ position }})</span>. Démarrage imminent…</span>
          </p>
          <p v-if="state === 'running'" class="status-step-msg">
            <span class="loading-spinner-inline" aria-hidden="true"></span>
            <span>Collecte en cours auprès de l'API Riot (Match-V5 &amp; Timelines). Cela prend environ 30 à 45 secondes…</span>
          </p>
          <span class="status-note faint">Ne ferme pas cette page, ton tableau de bord s'ouvrira automatiquement dès la fin de l'analyse.</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-hero-widget {
  width: 100%;
  max-width: 100%;
  margin: 24px 0 0;
}

.register-bar-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 22px;
  background-color: #fffdfa;
  background-image: linear-gradient(176deg, rgba(255, 255, 255, 0.97) 0%, rgba(252, 248, 240, 0.94) 60%, rgba(246, 239, 227, 0.90) 100%);
  background-repeat: no-repeat;
  border: 1px solid rgba(195, 178, 155, 0.60);
  border-radius: 14px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 2px rgba(175, 155, 130, 0.12),
    0 20px 60px -18px rgba(20, 23, 24, 0.36);
  width: 100%;
  box-sizing: border-box;
}

.register-bar-inputs {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  width: 100%;
}

.register-label-riot {
  flex: 1 1 340px;
  margin: 0;
}

.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.input-icon {
  position: absolute;
  left: 12px;
  color: var(--primary);
  pointer-events: none;
  opacity: 0.85;
}

.register-input-id {
  width: 100%;
  padding-left: 36px;
  height: 42px;
  font-size: 14px;
  font-weight: 550;
  background: var(--surface);
  border-color: var(--gold);
  border-radius: 10px;
}
.register-input-id:focus {
  border-color: var(--primary);
  box-shadow: var(--focus-ring);
}

.register-label-server {
  flex: 0 0 220px;
  margin: 0;
}

.register-select-server {
  width: 100%;
  height: 42px;
  font-size: 13px;
  font-weight: 600;
  background: var(--surface);
  border-color: var(--gold);
  border-radius: 10px;
  cursor: pointer;
}

.register-submit-btn {
  height: 42px;
  padding: 0 24px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  color: #fffdf8 !important;
  background-color: #2e1e20 !important;
  background: var(--targon-veil-button) !important;
  border: 1px solid rgba(215, 175, 110, 0.55) !important;
  box-shadow:
    0 4px 14px rgba(35, 25, 27, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 -2px 6px rgba(0, 0, 0, 0.35) !important;
  transition: var(--transition-base);
}
.register-submit-btn:hover:not(:disabled) {
  background: var(--targon-veil-button-hover) !important;
  border-color: #ffd269 !important;
  box-shadow:
    0 6px 18px rgba(35, 25, 27, 0.40),
    0 0 16px rgba(255, 205, 80, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.22) !important;
  transform: translateY(-1px);
}
.register-submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.register-btn-arrow {
  color: #ffd269;
  filter: drop-shadow(0 0 4px rgba(255, 210, 80, 0.75));
  transition: transform 150ms ease;
}
.register-submit-btn:hover:not(:disabled) .register-btn-arrow {
  transform: translateX(3px);
  color: #fff0a8;
  filter: drop-shadow(0 0 8px rgba(255, 220, 100, 0.95));
}

.register-err-msg {
  margin-top: 8px;
  font-size: 13px;
}

/* Ingestion Stepper View (/register/:slug) */
.register-status-view {
  max-width: 660px;
  margin: 36px auto;
  text-align: center;
}

.hero-live-pill--error {
  background: var(--loss-soft);
  border-color: var(--loss-border);
  color: var(--danger);
}

.live-indicator-dot.dot--error {
  background: var(--danger);
}

.status-title {
  font-size: clamp(28px, 4.5vw, 36px);
  font-weight: 850;
  letter-spacing: -.03em;
  margin: 12px 0 8px;
  line-height: 1.15;
}

.status-subtitle {
  font-size: 14.5px;
  color: var(--text-dim);
  margin: 0 auto 28px;
  max-width: 540px;
  line-height: 1.5;
}

.status-progress-card {
  padding: 32px 28px;
  background: var(--surface);
  border: 1.5px solid rgba(195, 160, 110, 0.45);
  border-radius: 18px;
  box-shadow:
    0 8px 32px rgba(20, 23, 24, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  text-align: left;
}

.status-progress-card.card--error {
  border-color: var(--loss-border);
  box-shadow: var(--shadow-overlay);
}

.status-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  padding: 0 12px;
}

.status-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 2;
}

.step-num {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 2px solid var(--border-soft);
  font-size: 13px;
  font-weight: 800;
  color: var(--text-faint);
  transition: all 220ms ease;
}

.status-step.active .step-num {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
  animation: step-pulse 2s infinite;
}

.status-step.done .step-num {
  background: var(--win-soft);
  border-color: var(--win);
  color: var(--win);

}

.status-step.error .step-num {
  background: var(--loss-soft);
  border-color: var(--loss-border);
  color: var(--danger);
  font-weight: 900;
}

.step-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-faint);
  letter-spacing: .02em;
  transition: color 200ms ease;
}
.status-step.active .step-label { color: var(--primary); }
.status-step.done .step-label { color: var(--win); }
.status-step.error .step-label { color: var(--danger); }

.step-sep {
  flex: 1;
  height: 2px;
  background: var(--surface-alt);
  margin: -22px 12px 0;
  border-radius: 999px;
  transition: background 250ms ease;
}
.step-sep.active {
  background: var(--primary);
}

/* Error Box */
.status-error-box {
  background: var(--loss-soft);
  border: 1px solid var(--loss-border);
  border-radius: 14px;
  padding: 22px;
}

.status-error-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.status-error-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--loss-soft);
  border: 1px solid var(--loss-border);
  display: grid;
  place-items: center;
  color: var(--danger);
  flex-shrink: 0;
}

.status-error-content {
  flex: 1;
}

.status-error-heading {
  font-size: 15px;
  font-weight: 750;
  color: var(--danger);
  margin-bottom: 4px;
  letter-spacing: -.01em;
}

.status-error-message {
  font-size: 13.5px;
  color: var(--danger);
  margin: 0;
  line-height: 1.5;
  font-weight: 500;
}

.status-error-tips {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--loss-border);
}

.tip-title {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--text-faint);
  margin-bottom: 8px;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.65;
}

.tip-list code {
  padding: 2px 6px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--primary);
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
}

.status-actions-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  flex-wrap: wrap;
}

.status-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}
.status-action-btn .btn-arrow-left {
  font-size: 14px;
  transition: var(--transition-transform-fast);
}
.status-action-btn:hover .btn-arrow-left {
  transform: translateX(-3px);
}

.status-secondary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-alt);
  border: 1px solid var(--border-soft);
  text-decoration: none;
  transition: var(--transition-base);
}
.status-secondary-btn:hover {
  background: var(--panel-hover);
  border-color: var(--primary);
  color: var(--text);
  text-decoration: none;
  transform: translateY(-1px);
}
.status-secondary-btn .btn-arrow-right {
  color: var(--primary);
  font-size: 13px;
  transition: var(--transition-transform-fast);
}
.status-secondary-btn:hover .btn-arrow-right {
  transform: translateX(3px);
}

/* Loading Box */
.status-loading-box {
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 14px;
  padding: 24px 20px;
}

.status-progress-bar-wrap {
  width: 100%;
  height: 6px;
  background: var(--surface);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 18px;
  border: 1px solid var(--border);
  position: relative;
}

.status-progress-bar.indeterminate {
  width: 35%;
  height: 100%;
  background: var(--primary-gradient);
  border-radius: 999px;

  animation: progress-indeterminate 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(180%); }
  100% { transform: translateX(320%); }
}

.status-desc-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-step-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  margin: 0;
}

.status-note {
  font-size: 12px;
  color: var(--text-faint);
  line-height: 1.45;
  margin-top: 4px;
}

@media (max-width: 860px) {
  .register-bar-inputs {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .register-label-riot,
  .register-label-server,
  .register-submit-btn {
    width: 100%;
    flex: 1 1 100%;
  }
}
</style>

@keyframes step-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .72; transform: scale(.97); }
}
