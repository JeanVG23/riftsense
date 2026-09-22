<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  formatDate,
  formatPseudo,
  rankEmblem,
  tierAccent,
  rankLabel,
  rankWinrate,
  summonerIcon,
  summonerProfile,
  titleCase,
  type CurrentRank,
  type PredictedRank,
} from "../account-profile";
import { withAuthHeaders } from "../auth";
import type { IngestSync } from "../ingest-sync";
import {
  boundaryLabel,
  formatLogit,
  parseRoleAnalysis,
  roleLabel,
  type RoleAnalysisPayload,
} from "../role-analysis";

const props = withDefaults(defineProps<{
  slug: string;
  total?: number;
  sync: IngestSync;
  reloadToken: number;
}>(), { total: 0 });

const emit = defineEmits<{
  predictionLoaded: [prediction: PredictedRank | null];
  openShap: [];
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

const account = ref<AccountRecord | null>(null);
const rank = ref<CurrentRank | null>(null);
const predictedRank = ref<PredictedRank | null>(null);
const roleAnalysis = ref<RoleAnalysisPayload | null>(null);
const rankLoading = ref(true);
let requestSequence = 0;

/** Identité affichée. Le slug seul ne sert que de repli le temps du
 * chargement : il ne porte ni l'icône ni le niveau du joueur. */
const profile = computed(() => summonerProfile(account.value ?? props.slug));

/** Priorité de la carte ML (spec §5.3) : analyse de rôle disponible →
 * proximité à l'apex ; sinon prédiction ML publiée (comptes curés) ;
 * sinon repli honnête. Le logit ne se convertit JAMAIS en probabilité ni
 * en rang : MASTER n'est dans aucune classe d'entraînement. */
interface MlCard { label: string; value: string; note: string; tier: string; emblem: string; }

const mlCard = computed<MlCard>(() => {
  const analysis = roleAnalysis.value;
  if (analysis?.available) {
    return {
      label: "Apex proximity",
      value: analysis.logit !== null && analysis.logit !== undefined ? formatLogit(analysis.logit) : "?",
      note: analysis.model?.boundary
        ? `${roleLabel(analysis.role)} · ${boundaryLabel(analysis.model.boundary)} boundary`
        : roleLabel(analysis.role),
      tier: "",
      emblem: "",
    };
  }
  const prediction = predictedRank.value;
  if (prediction?.predicted_rank) {
    return {
      label: "ML estimate",
      value: titleCase(prediction.predicted_rank),
      note: prediction.proba ? `${Math.round(prediction.proba * 100)}% confidence` : "",
      tier: tierAccent(prediction.predicted_rank),
      emblem: rankEmblem(prediction.predicted_rank) || "",
    };
  }
  return { label: "ML estimate", value: "—", note: "", tier: "", emblem: "" };
});

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
  const [nextAccount, nextRank, nextPrediction, nextRoleRaw] = await Promise.all([
    getJson<AccountRecord>(`/api/c/${encodedSlug}/account`),
    getJson<CurrentRank>(`/api/c/${encodedSlug}/rank`),
    getJson<PredictedRank>(`/api/c/${encodedSlug}/predicted-rank`),
    getJson<unknown>(`/api/c/${encodedSlug}/shap-role`),
  ]);
  if (sequence !== requestSequence) return;
  account.value = nextAccount;
  rank.value = nextRank;
  predictedRank.value = nextPrediction;
  roleAnalysis.value = parseRoleAnalysis(nextRoleRaw);
  rankLoading.value = false;
  emit("predictionLoaded", nextPrediction);
}

watch(() => props.slug, () => {
  // Sans cette remise à zéro, l'avatar, le rang ET l'estimation ML du compte
  // précédent resteraient affichés le temps de la requête, sous le pseudo du
  // nouveau : toute la carte ML d'un autre joueur lue comme la sienne.
  account.value = null;
  rank.value = null;
  predictedRank.value = null;
  roleAnalysis.value = null;
  rankLoading.value = true;
  void loadProfile();
});

// La collecte vient de finir (composable de la page) : niveau, icône et rang
// ont pu bouger.
watch(() => props.reloadToken, () => { void loadProfile(); });

onMounted(() => { void loadProfile(); });
</script>

<template>
  <section class="profile-hero">
    <div class="profile-main">
      <div class="profile-identity">
        <div class="summoner-avatar-wrap hero-avatar-wrap">
          <img class="summoner-avatar hero-avatar" :src="summonerIcon(profile.icon)" :alt="slug" loading="eager">
          <span v-if="profile.level" class="summoner-level hero-level">Lv. {{ profile.level }}</span>
        </div>
        <div class="profile-titles">
          <div class="profile-name-row">
            <h1>{{ formatPseudo(account ?? slug) }}</h1>
            <span class="badge badge-region">{{ profile.tag }}</span>
          </div>
          <div class="profile-actions-row">
            <button
              class="btn-sync-profile"
              :class="{ 'is-syncing': sync.syncing, 'is-cooling': sync.cooling }"
              :disabled="sync.syncing || sync.cooling"
              type="button"
              :title="sync.cooling
                ? 'Data already refreshed: you can refresh again every 15 minutes'
                : 'Sync the latest games from the Riot API (once every 15 minutes)'"
              @click="sync.trigger"
            >
              <svg class="sync-icon" :class="{ spinning: sync.syncing }" viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
              </svg>
              <span>{{ sync.feedback || (sync.syncing ? "Syncing…" : (sync.cooling ? sync.cooldownLabel : "Refresh data")) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="profile-stats" aria-label="Account summary">
      <div class="profile-stat stat-games">
        <span class="stat-label">Saved games</span>
        <strong class="stat-value num">{{ total }}</strong>
      </div>
      <div class="profile-stat stat-rank" :class="rank?.tier ? tierAccent(rank.tier) : ''">
        <div class="rank-stat-layout">
          <img v-if="rank?.tier && rankEmblem(rank.tier)" class="rank-emblem" :src="rankEmblem(rank.tier)" :alt="rank.tier" loading="eager">
          <div class="rank-stat-text">
            <span class="stat-label">Current rank</span>
            <strong class="stat-value rank-badge">{{ rankLoading ? "…" : rankLabel(rank) }}</strong>
            <span v-if="rankWinrate(rank)" class="stat-note rank-winrate">{{ rankWinrate(rank) }}</span>
            <span v-else-if="rank?.fetched_at" class="stat-note">Updated {{ formatDate(rank.fetched_at) }}</span>
          </div>
        </div>
      </div>
      <div
        class="profile-stat stat-ml is-clickable"
        :class="mlCard.tier"
        tabindex="0"
        role="button"
        aria-label="View ML explainability and the SHAP chart"
        title="Click to view the SHAP breakdown"
        @click="emit('openShap')"
        @keydown.enter="emit('openShap')"
      >
        <div class="rank-stat-layout">
          <img
            v-if="mlCard.emblem"
            class="rank-emblem rank-emblem-mini"
            :src="mlCard.emblem"
            alt=""
            loading="eager"
          >
          <div class="rank-stat-text">
            <div class="stat-label-with-action">
              <span class="stat-label">{{ mlCard.label }}</span>
              <span class="stat-cta-pill">SHAP →</span>
            </div>
            <strong class="stat-value">{{ mlCard.value }}</strong>
            <span v-if="mlCard.note" class="stat-note">{{ mlCard.note }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 28px 32px;
  margin-bottom: 20px;
  overflow: hidden;
  background:
    linear-gradient(105deg, rgba(255, 253, 248, .98) 0%, rgba(255, 253, 248, .92) 42%, rgba(247, 243, 235, .82) 72%, rgba(244, 238, 227, .30) 100%),
    url('/images/targon/sanctuaire-solaris.jpg') right 35% / cover no-repeat;
  border: 1.5px solid rgba(195, 160, 110, 0.48);
  border-radius: var(--radius);
  box-shadow:
    0 4px 20px rgba(20, 23, 24, 0.06),
    inset 0 1px 0 var(--surface-inset-highlight);
  transition: var(--transition-base);
}

.profile-hero:hover {
  border-color: rgba(185, 143, 83, 0.65);
  box-shadow:
    0 8px 26px rgba(185, 143, 83, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 1);
}

.profile-main {
  flex: 1 1 auto;
  min-width: 0;
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 20px;
}

.summoner-avatar-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.summoner-avatar {
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  background: var(--surface-alt);
  object-fit: cover;
  transition: var(--transition-base);
}

.summoner-level {
  position: absolute;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  font-size: var(--fs-micro);
  font-weight: 750;
  line-height: 1;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: .02em;
  white-space: nowrap;
}

.hero-avatar-wrap {
  width: 68px;
  height: 68px;
}

.hero-avatar {
  width: 68px;
  height: 68px;
  border-width: 2.5px;
}

.hero-level {
  bottom: -6px;
}

.hero-avatar-wrap:hover .summoner-avatar {
  border-color: var(--gold);
}

.profile-titles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.profile-name-row h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(30px, 3.6vw, 40px);
  letter-spacing: -.03em;
  line-height: 1.15;
  font-weight: 800;
}

.profile-actions-row {
  display: flex;
  align-items: center;
}

.btn-sync-profile {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: var(--fs-body-sm);
  font-weight: 650;
  color: var(--gold-deep);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  cursor: pointer;
  transition: var(--transition-base);
  font-family: inherit;
}

.btn-sync-profile:hover:not(:disabled) {
  color: var(--gold-deep);
  border-color: var(--gold);
  background: var(--primary-soft);
  transform: translateY(-1px);
}

.btn-sync-profile.is-syncing {
  opacity: .85;
  cursor: wait;
}

.btn-sync-profile.is-cooling {
  opacity: .65;
  cursor: not-allowed;
  background: var(--surface-alt);
  border-color: var(--border);
  color: var(--text-faint);
  transform: none;
}

.sync-icon.spinning {
  animation: spin .9s linear infinite;
}

.profile-stats {
  display: grid;
  grid-template-columns: minmax(120px, auto) minmax(220px, auto) minmax(170px, auto);
  gap: 1px;
  flex-shrink: 0;
  overflow: hidden;
  background: rgba(195, 160, 110, 0.45);
  border: 1.5px solid rgba(195, 160, 110, 0.45);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(20, 23, 24, 0.04);
}

.profile-stat {
  display: flex;
  min-width: 0;
  min-height: 94px;
  flex-direction: column;
  justify-content: center;
  padding: 12px 18px;
  background: rgba(255, 253, 248, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: var(--transition-base);
}

.profile-stat:hover {
  background: rgba(255, 255, 255, 0.98);
}

.profile-stat.stat-ml.is-clickable {
  cursor: pointer;
  transition: var(--transition-base);
  position: relative;
}

.profile-stat.stat-ml.is-clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px -18px rgba(126, 97, 52, .72);
}

.rank-stat-layout {
  display: flex;
  align-items: center;
  gap: 14px;
}

.rank-emblem {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
  filter: none;
  transition: transform 200ms ease;
}

.profile-stat:hover .rank-emblem {
  transform: scale(1.06);
}

.rank-emblem-mini {
  width: 40px;
  height: 40px;
}

.rank-stat-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-label {
  color: var(--text-faint);
  font-size: var(--fs-label);
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.stat-label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.stat-cta-pill {
  font-size: var(--fs-micro);
  padding: 1px 5px;
  background: var(--primary-soft);
  color: var(--gold-deep);
  border: 1px solid var(--primary-border);
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: .02em;
}

.stat-value {
  margin-top: 3px;
  overflow: hidden;
  color: var(--ink);
  font-size: var(--fs-lead);
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-note {
  margin-top: 3px;
  font-size: var(--fs-label);
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-faint);
}

.rank-winrate {
  margin-top: 3px;
  color: var(--text-dim);
  font-size: var(--fs-label);
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

@media (max-width: 860px) {
  .profile-hero {
    align-items: stretch;
    flex-direction: column;
  }
  .profile-stats {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .profile-name-row h1 {
    font-size: 30px;
  }
  .profile-hero {
    gap: 20px;
    padding: 20px;
    border-radius: 14px;
  }
  .profile-identity {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .profile-stats {
    grid-template-columns: 1fr;
  }
  .profile-stat {
    min-height: 64px;
    padding: 12px 14px;
  }
  .rank-stat-layout {
    gap: 12px;
  }
  .rank-emblem {
    width: 44px;
    height: 44px;
  }
}
</style>
