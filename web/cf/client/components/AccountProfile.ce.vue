<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  formatDate,
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
}>();

const rank = ref<CurrentRank | null>(null);
const predictedRank = ref<PredictedRank | null>(null);
const rankLoading = ref(true);
let requestSequence = 0;

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
  const [nextRank, nextPrediction] = await Promise.all([
    getJson<CurrentRank>(`/api/c/${encodedSlug}/rank`),
    getJson<PredictedRank>(`/api/c/${encodedSlug}/predicted-rank`),
  ]);
  if (sequence !== requestSequence) return;
  rank.value = nextRank;
  predictedRank.value = nextPrediction;
  rankLoading.value = false;
  emit("predictionLoaded", nextPrediction);
}

watch(() => props.slug, loadProfile);
onMounted(loadProfile);
</script>

<template>
  <section class="profile-hero">
    <div class="profile-main">
      <div class="profile-identity">
        <div class="summoner-avatar-wrap hero-avatar-wrap">
          <img class="summoner-avatar hero-avatar" :src="summonerIcon(slug)" :alt="slug" loading="eager">
          <span v-if="summonerProfile(slug).level" class="summoner-level hero-level">Niv. {{ summonerProfile(slug).level }}</span>
        </div>
        <div class="profile-titles">
          <div class="row" style="gap: 8px; align-items: center">
            <p class="eyebrow" style="margin:0">TABLEAU DE BORD</p>
            <span class="badge badge-region">{{ summonerProfile(slug).tag || "EUW" }}</span>
          </div>
          <h1>{{ slug }}</h1>
          <p class="profile-description">Tes dernières parties et les leviers les plus utiles pour progresser.</p>
        </div>
      </div>
    </div>
    <div class="profile-stats" aria-label="Résumé du compte">
      <div class="profile-stat stat-games">
        <span class="stat-label">Parties analysées</span>
        <strong class="stat-value num">{{ total }}</strong>
        <span class="stat-note">Historique solo/duo</span>
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
      <div class="profile-stat stat-ml" :class="predictedRank?.predicted_rank ? rankGlow(predictedRank.predicted_rank) : ''">
        <div class="rank-stat-layout">
          <img
            v-if="predictedRank?.predicted_rank && rankEmblem(predictedRank.predicted_rank)"
            class="rank-emblem rank-emblem-mini"
            :src="rankEmblem(predictedRank.predicted_rank)"
            :alt="predictedRank.predicted_rank"
            loading="eager"
          >
          <div class="rank-stat-text">
            <span class="stat-label">Estimation ML</span>
            <strong class="stat-value">{{ predictedRank?.predicted_rank ? titleCase(predictedRank.predicted_rank) : "—" }}</strong>
            <span v-if="predictedRank?.proba" class="stat-note">Confiance {{ Math.round(predictedRank.proba * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
