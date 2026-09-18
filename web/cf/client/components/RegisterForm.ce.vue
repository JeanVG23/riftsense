<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RECENT_ACCOUNTS_CHANGED, rememberRecentAccount } from "../recent-accounts";


type RegistrationState = "queued" | "running" | "done" | "error";

interface RegistrationResponse {
  slug?: string;
  detail?: string;
  state?: RegistrationState;
  error_code?: string;
  position?: number | null;
  n_games?: number | null;
}

const props = withDefaults(defineProps<{ mode?: "form" | "status" }>(), {
  mode: "form",
});

const REGISTER_ERRORS: Record<string, string> = {
  riot_id_not_found: "Ce Riot ID est introuvable. Vérifie le pseudo et le tag.",
  no_ranked_games: "Aucune partie classée récente trouvée sur ce compte.",
  riot_unavailable: "L'API Riot ne répond pas pour le moment. Réessaie dans quelques minutes.",
  internal: "Une erreur interne est survenue. Réessaie plus tard.",
};
const MAX_NETWORK_RETRIES = 5;

const riotId = ref("");
const platform = ref("euw1");
const state = ref<RegistrationState | null>(null);
const position = ref<number | null>(null);
const error = ref<string | null>(null);
const submitting = ref(false);
const slug = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let networkFailures = 0;
let stopped = false;

function navigate(path: string) {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path } }));
}

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
  error.value = null;
  submitting.value = true;
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riot_id: riotId.value, platform: platform.value }),
    });
    const body = await response.json().catch(() => ({})) as RegistrationResponse;
    if (!response.ok || !body.slug) {
      error.value = body.detail || REGISTER_ERRORS.internal;
      return;
    }
    rememberRecentAccount({
      slug: body.slug,
      riot_id: riotId.value,
      region: platform.value,
      games_count: body.n_games ?? undefined,
    });
    window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
    navigate(`/register/${body.slug}`);
  } catch {
    error.value = REGISTER_ERRORS.internal;
  } finally {
    submitting.value = false;
  }
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
    navigate(`/c/${slug.value}`);
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
  navigate("/");
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
            <option value="euw1">EUW (Europe Ouest)</option>
            <option value="eun1">EUNE (Europe Nord/Est)</option>
            <option value="na1">NA (Amérique du Nord)</option>
            <option value="kr">KR (Corée)</option>
            <option value="br1">BR (Brésil)</option>
            <option value="jp1">JP (Japon)</option>
            <option value="tr1">TR (Turquie)</option>
            <option value="la1">LAN (Am. Latine Nord)</option>
            <option value="la2">LAS (Am. Latine Sud)</option>
            <option value="oc1">OCE (Océanie)</option>
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
      <span v-if="state === 'error'" class="text-gradient-coral">Analyse impossible</span>
      <span v-else class="text-gradient-cyan">Analyse de ton compte en cours</span>
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
