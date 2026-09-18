<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  formatDate,
  formatPseudo,
  rankEmblem,
  rankGlow,
  rankLabel,
  rankWinrate,
  summonerIcon,
  summonerProfile,
  titleCase,
  type CurrentRank,
  type PredictedRank,
} from "../account-profile";
import { withAuthHeaders } from "../auth";

const props = withDefaults(defineProps<{
  slug: string;
  total?: number;
}>(), { total: 0 });

const emit = defineEmits<{
  predictionLoaded: [prediction: PredictedRank | null];
  openShap: [];
  synced: [];
}>();

/** Ce que publie `/api/c/{slug}/account`. L'icône et le niveau sont lus dans
 * Match-V5 à chaque collecte : ils n'existent donc qu'une fois le compte
 * ingéré, et `summonerProfile` sait retomber sur son repli sans eux. */
interface AccountRecord {
  slug: string;
  riot_id?: string;
  region?: string;
  icon?: number;
  level?: number;
}

interface RefreshResponse {
  detail?: string;
  retry_after?: number;
  cooldown?: number;
  state?: "queued" | "running" | "done" | "error";
  position?: number;
  n_games?: number;
  error_code?: string;
}

/** Codes de la file d'ingestion, formulés court : ils s'affichent DANS le
 * bouton, pas dans un bandeau. */
const REFRESH_ERRORS: Record<string, string> = {
  riot_id_not_found: "Riot ID introuvable",
  no_ranked_games: "Aucune partie classée",
  riot_unavailable: "API Riot indisponible",
  internal: "Erreur interne",
};
const POLL_INTERVAL_MS = 3000;
/** Au-delà, on rend la main : la collecte se poursuit côté serveur, c'est le
 * suivi qui s'arrête, pas le job. */
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
/** Repli si la réponse n'annonce pas sa propre fenêtre. Le serveur reste
 * l'arbitre de la cadence : cette valeur ne fait que griser le bouton. */
const FALLBACK_COOLDOWN_S = 15 * 60;

const account = ref<AccountRecord | null>(null);
const rank = ref<CurrentRank | null>(null);
const predictedRank = ref<PredictedRank | null>(null);
const rankLoading = ref(true);
const syncing = ref(false);
const syncFeedback = ref<string | null>(null);
const cooldownUntil = ref(0);
const now = ref(Date.now());
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let requestSequence = 0;
let syncSequence = 0;

/** Identité affichée. Le slug seul ne sert que de repli le temps du
 * chargement : il ne porte ni l'icône ni le niveau du joueur. */
const profile = computed(() => summonerProfile(account.value ?? props.slug));

const cooling = computed(() => cooldownUntil.value > now.value);
const cooldownLabel = computed(() => {
  const minutes = Math.ceil((cooldownUntil.value - now.value) / 60000);
  return minutes > 1 ? `À jour · ${minutes} min` : "À jour · < 1 min";
});

/** Mémoriser la fenêtre ici ne la fait pas respecter : c'est le serveur qui
 * refuse. Ça évite seulement de la redécouvrir par un 429 après un F5.
 * `localStorage` lève en navigation privée, son échec ne doit rien casser. */
const cooldownKey = () => `riftsense:refresh:${props.slug}`;

function stopClock(): void {
  if (clock !== null) clearInterval(clock);
  clock = null;
}

function startClock(): void {
  if (clock === null) {
    clock = setInterval(() => {
      now.value = Date.now();
      if (!cooling.value) stopClock();
    }, 1000);
  }
}

function setCooldown(seconds: number): void {
  now.value = Date.now();
  cooldownUntil.value = now.value + seconds * 1000;
  try { localStorage.setItem(cooldownKey(), String(cooldownUntil.value)); } catch { /* ignoré */ }
  startClock();
}

function restoreCooldown(): void {
  let stored = 0;
  try { stored = Number(localStorage.getItem(cooldownKey())) || 0; } catch { stored = 0; }
  now.value = Date.now();
  cooldownUntil.value = stored > now.value ? stored : 0;
  if (cooling.value) startClock(); else stopClock();
}

function scheduleFeedbackReset(delay = 3500): void {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { syncFeedback.value = null; }, delay);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Suit le job jusqu'à son terme. `token` vaut le `syncSequence` du clic :
 * un changement de slug ou un démontage l'invalide et la boucle rend la main
 * sans toucher à l'état d'un autre compte. */
async function followJob(token: number, cooldown: number): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (token !== syncSequence) return;
    const status = await getJson<RefreshResponse>(
      `/api/register/${encodeURIComponent(props.slug)}/status`);
    if (token !== syncSequence) return;
    if (status?.state === "error") {
      // Pas de fenêtre posée sur un échec : la file a déjà la sienne, plus
      // courte, pour qu'un tag mal tapé se corrige tout de suite.
      syncFeedback.value = REFRESH_ERRORS[status.error_code ?? ""] ?? REFRESH_ERRORS.internal;
      return;
    }
    if (status?.state === "done") {
      setCooldown(cooldown);
      syncFeedback.value = status.n_games
        ? `${status.n_games} parties synchronisées` : "Synchronisation terminée";
      emit("synced");
      void loadProfile();
      return;
    }
    syncFeedback.value = status?.state === "running"
      ? "Collecte en cours…"
      : `En file d'attente (${status?.position ?? 1})`;
  }
  syncFeedback.value = "Collecte toujours en cours…";
}

async function triggerSync(): Promise<void> {
  if (syncing.value || cooling.value) return;
  const token = ++syncSequence;
  syncing.value = true;
  syncFeedback.value = "Interrogation de Riot…";
  try {
    // Par slug, jamais par Riot ID reconstitué : les comptes curés portent un
    // slug écrit à la main que `slugFor` ne reproduit pas, et une inscription
    // bâtie depuis l'URL collecterait un compte fantôme à côté du vrai.
    const response = await fetch(`/api/c/${encodeURIComponent(props.slug)}/refresh`, {
      method: "POST",
      headers: withAuthHeaders(),
    });
    const body = await response.json().catch(() => ({})) as RefreshResponse;
    if (token !== syncSequence) return;
    if (response.status === 429) {
      setCooldown(body.retry_after ?? FALLBACK_COOLDOWN_S);
      syncFeedback.value = "Données déjà à jour";
      return;
    }
    if (!response.ok) {
      syncFeedback.value = body.detail || REFRESH_ERRORS.internal;
      return;
    }
    await followJob(token, body.cooldown ?? FALLBACK_COOLDOWN_S);
  } catch {
    syncFeedback.value = "Erreur de connexion";
  } finally {
    if (token === syncSequence) {
      syncing.value = false;
      scheduleFeedbackReset();
    }
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { headers: withAuthHeaders() });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function loadProfile(): Promise<void> {
  const sequence = ++requestSequence;
  rankLoading.value = true;
  const encodedSlug = encodeURIComponent(props.slug);
  const [nextAccount, nextRank, nextPrediction] = await Promise.all([
    getJson<AccountRecord>(`/api/c/${encodedSlug}/account`),
    getJson<CurrentRank>(`/api/c/${encodedSlug}/rank`),
    getJson<PredictedRank>(`/api/c/${encodedSlug}/predicted-rank`),
  ]);
  if (sequence !== requestSequence) return;
  account.value = nextAccount;
  rank.value = nextRank;
  predictedRank.value = nextPrediction;
  rankLoading.value = false;
  emit("predictionLoaded", nextPrediction);
}

watch(() => props.slug, () => {
  // Sans cette remise à zéro, l'avatar du compte précédent resterait affiché
  // le temps de la requête, sous le pseudo du nouveau.
  account.value = null;
  syncSequence += 1;
  syncing.value = false;
  syncFeedback.value = null;
  restoreCooldown();
  void loadProfile();
});
onMounted(() => {
  restoreCooldown();
  void loadProfile();
});
onBeforeUnmount(() => {
  syncSequence += 1;
  stopClock();
  if (feedbackTimer) clearTimeout(feedbackTimer);
});
</script>

<template>
  <section class="profile-hero">
    <div class="profile-main">
      <div class="profile-identity">
        <div class="summoner-avatar-wrap hero-avatar-wrap">
          <img class="summoner-avatar hero-avatar" :src="summonerIcon(profile.icon)" :alt="slug" loading="eager">
          <span v-if="profile.level" class="summoner-level hero-level">Niv. {{ profile.level }}</span>
        </div>
        <div class="profile-titles">
          <div class="profile-name-row">
            <h1>{{ formatPseudo(account ?? slug) }}</h1>
            <span class="badge badge-region">{{ profile.tag }}</span>
          </div>
          <div class="profile-actions-row">
            <button
              class="btn-sync-profile"
              :class="{ 'is-syncing': syncing, 'is-cooling': cooling }"
              :disabled="syncing || cooling"
              type="button"
              :title="cooling
                ? 'Collecte déjà effectuée : une nouvelle est possible toutes les 15 minutes'
                : 'Synchroniser les dernières parties depuis l\'API Riot (une fois toutes les 15 minutes)'"
              @click="triggerSync"
            >
              <svg class="sync-icon" :class="{ spinning: syncing }" viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
              </svg>
              <span>{{ syncFeedback || (syncing ? "Synchronisation…" : (cooling ? cooldownLabel : "Actualiser les données")) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="profile-stats" aria-label="Résumé du compte">
      <div class="profile-stat stat-games">
        <span class="stat-label">Parties enregistrées</span>
        <strong class="stat-value num">{{ total }}</strong>
      </div>
      <div class="profile-stat stat-rank" :class="rank?.tier ? rankGlow(rank.tier) : ''">
        <div class="rank-stat-layout">
          <img v-if="rank?.tier && rankEmblem(rank.tier)" class="rank-emblem" :src="rankEmblem(rank.tier)" :alt="rank.tier" loading="eager">
          <div class="rank-stat-text">
            <span class="stat-label">Rang actuel</span>
            <strong class="stat-value rank-badge">{{ rankLoading ? "…" : rankLabel(rank) }}</strong>
            <span v-if="rankWinrate(rank)" class="stat-note rank-winrate">{{ rankWinrate(rank) }}</span>
            <span v-else-if="rank?.fetched_at" class="stat-note">Mis à jour le {{ formatDate(rank.fetched_at) }}</span>
          </div>
        </div>
      </div>
      <div
        class="profile-stat stat-ml is-clickable"
        :class="predictedRank?.predicted_rank ? rankGlow(predictedRank.predicted_rank) : ''"
        tabindex="0"
        role="button"
        aria-label="Consulter l'explicabilité ML et le graphique SHAP"
        title="Cliquer pour afficher la décomposition SHAP"
        @click="emit('openShap')"
        @keydown.enter="emit('openShap')"
      >
        <div class="rank-stat-layout">
          <img
            v-if="predictedRank?.predicted_rank && rankEmblem(predictedRank.predicted_rank)"
            class="rank-emblem rank-emblem-mini"
            :src="rankEmblem(predictedRank.predicted_rank)"
            :alt="predictedRank.predicted_rank"
            loading="eager"
          >
          <div class="rank-stat-text">
            <div class="stat-label-with-action">
              <span class="stat-label">Estimation ML</span>
              <span class="stat-cta-pill">SHAP →</span>
            </div>
            <strong class="stat-value">{{ predictedRank?.predicted_rank ? titleCase(predictedRank.predicted_rank) : "—" }}</strong>
            <span v-if="predictedRank?.proba" class="stat-note">Confiance {{ Math.round(predictedRank.proba * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
