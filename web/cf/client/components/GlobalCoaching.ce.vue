<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { formatDate } from "../account-profile";
import { insightBody, insightTitle, outcomeLabel } from "../coaching";
import { withAuthHeaders } from "../auth";
import FeedbackButtons from "./FeedbackButtons.vue";

interface Insight {
  point?: string;
  cause?: string;
  evidence?: string;
}

interface ReviewContent {
  strengths?: Insight[];
  mistakes?: Insight[];
  habits?: string[];
  next_focus?: string;
  confidence?: number;
}

interface ReviewMeta {
  scope?: string;
  n_games_me?: number;
  n_games_ref?: number;
  winrate_me?: number;
  low_sample?: boolean;
  n_game_reviews_available?: number;
  n_game_reviews_available_wins?: number;
  n_game_reviews_available_losses?: number;
  n_game_reviews_used?: number;
  n_game_reviews_used_wins?: number;
  n_game_reviews_used_losses?: number;
  n_game_reviews_wins?: number;
  n_game_reviews_losses?: number;
  qualitative_mode?: string;
  unbalanced_causes?: unknown;
}

interface AggregateReview {
  ts: string;
  model?: string;
  scope?: string;
  outcome_focus?: string;
  payload?: { meta?: ReviewMeta };
  review: ReviewContent;
}

interface FeedbackValue {
  useful: boolean;
  tag?: string | null;
  note?: string | null;
}

interface CoachingContext {
  aggregate_status?: Record<string, Record<string, { needs_refresh?: boolean; stale_prompt?: boolean }>>;
  review_samples?: Record<string, { latest_ts?: string }>;
}

const props = withDefaults(defineProps<{
  slug: string;
  review?: AggregateReview | null;
  reviews?: AggregateReview[];
  loading?: boolean;
  scope?: string;
  scopeName?: string;
  outcome?: string;
  authenticated?: boolean;
  busy?: boolean;
  coachingContext?: CoachingContext | null;
}>(), {
  review: null,
  reviews: () => [],
  loading: false,
  scope: "adc",
  scopeName: "ADC",
  outcome: "loss",
  authenticated: false,
  busy: false,
  coachingContext: null,
});

const emit = defineEmits<{
  generate: [];
  "review-select": [review: AggregateReview];
  "feedback-saved": [];
}>();

const feedback = ref<Record<string, FeedbackValue>>({});
const feedbackBusy = ref<Record<string, boolean>>({});
const openFeedback = ref<string | null>(null);
const feedbackError = ref<string | null>(null);
let feedbackSequence = 0;

const meta = computed(() => props.review?.payload?.meta || {});
const needsRefresh = computed(() => {
  if (!props.review?.ts) return false;
  const status = props.coachingContext?.aggregate_status?.[props.scope]?.[props.outcome];
  if (status) return Boolean(status.needs_refresh || status.stale_prompt);
  const latest = props.coachingContext?.review_samples?.[props.scope]?.latest_ts;
  return Boolean(latest && latest > props.review.ts);
});

function key(kind: string, index: number): string {
  return `${kind},${index}`;
}

async function loadFeedback(): Promise<void> {
  const sequence = ++feedbackSequence;
  feedback.value = {};
  openFeedback.value = null;
  feedbackError.value = null;
  if (!props.review?.ts) return;
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(props.slug)}/feedback`, {
      headers: withAuthHeaders(),
    });
    if (!response.ok) return;
    const list = await response.json() as Array<{ ts: string; items?: Array<FeedbackValue & { kind: string; index: number }> }>;
    const current = list.find(item => item.ts === props.review?.ts);
    const next: Record<string, FeedbackValue> = {};
    for (const item of current?.items || []) {
      next[key(item.kind, item.index)] = {
        useful: item.useful,
        tag: item.tag,
        note: item.note,
      };
    }
    if (sequence === feedbackSequence) feedback.value = next;
  } catch {
    // Le coaching reste consultable si les annotations sont indisponibles.
  }
}

async function submitFeedback(kind: string, index: number, useful: boolean, tag: string | null = null): Promise<void> {
  if (!props.review) return;
  const itemKey = key(kind, index);
  if (!useful && !tag) {
    openFeedback.value = itemKey;
    return;
  }
  const next = { ...feedback.value, [itemKey]: { useful, ...(tag ? { tag } : {}) } };
  feedbackBusy.value = { ...feedbackBusy.value, [itemKey]: true };
  feedbackError.value = null;
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ slug: props.slug, ts: props.review.ts, responses: next }),
    });
    if (!response.ok) throw new Error(String(response.status));
    feedback.value = next;
    openFeedback.value = null;
    emit("feedback-saved");
  } catch (error) {
    feedbackError.value = /429/.test(String(error))
      ? "Trop de votes en peu de temps. Réessaie dans une heure."
      : "Le vote n’a pas été enregistré. Réessaie dans un instant.";
  } finally {
    feedbackBusy.value = { ...feedbackBusy.value, [itemKey]: false };
  }
}

watch([() => props.slug, () => props.review?.ts], loadFeedback, { immediate: true });
</script>

<template>
  <div v-if="loading" class="state">Chargement des analyses…</div>
  <div v-else-if="!review" class="state empty-state coach-empty-card">
    <div class="coach-empty-icon" style="font-size:32px;margin-bottom:8px">🎯</div>
    <strong>Aucun coaching global enregistré pour {{ outcomeLabel(outcome) }} ({{ scopeName }})</strong>
    <p style="margin:6px 0 14px;color:var(--text-dim)">Génère une analyse comparative complète pour identifier tes forces, erreurs et habitudes face aux joueurs Challenger.</p>
    <button class="btn btn-primary" :disabled="busy" @click="emit('generate')">
      {{ busy ? "Génération en cours…" : (authenticated ? `Générer l’analyse ${outcomeLabel(outcome)} →` : "🔒 Connexion requise pour générer →") }}
    </button>
  </div>

  <div v-else>
    <div class="meta-strip row wrap">
      <span class="num">{{ meta.n_games_me || 0 }} parties analysées</span>
      <span class="faint">comparées à {{ meta.n_games_ref || 0 }} références Challenger</span>
      <span class="num">Taux de victoire : {{ Math.round((meta.winrate_me || 0) * 100) }}%</span>
      <span class="badge" :class="outcome === 'win' ? 'badge-win' : (outcome === 'loss' ? 'badge-loss' : 'badge-neutral')">{{ outcomeLabel(outcome) }}</span>
      <span class="badge badge-scope">{{ scopeName }}</span>
      <span v-if="meta.low_sample" class="badge badge-loss">échantillon limité</span>
      <span class="faint">{{ review.model }}</span>
      <span class="faint">{{ formatDate(review.ts) }}</span>
    </div>

    <div class="sample-transparency-card">
      <div class="sample-transparency-main">
        <span class="sample-stat-icon">📊</span>
        <div class="sample-stat-text">
          <div class="sample-stat-header">
            <strong>Socle statistique : {{ meta.n_games_me || 0 }} parties réelles de {{ scopeName }}</strong>
            <span class="faint">· Winrate réel : {{ Math.round((meta.winrate_me || 0) * 100) }}%</span>
          </div>
          <div class="sample-stat-sub faint">
            <span v-if="meta.n_game_reviews_available != null">
              <strong>{{ meta.n_game_reviews_available || 0 }}</strong> analyses unitaires disponibles
              ({{ meta.n_game_reviews_available_wins || 0 }}V · {{ meta.n_game_reviews_available_losses || 0 }}D) ·
            </span>
            <span v-if="meta.n_game_reviews_used">
              ✦ <strong>{{ meta.n_game_reviews_used }}</strong> analyses unitaires intégrées
              ({{ meta.n_game_reviews_used_wins ?? meta.n_game_reviews_wins ?? 0 }}V · {{ meta.n_game_reviews_used_losses ?? meta.n_game_reviews_losses ?? 0 }}D)
            </span>
            <span v-else>✦ Aucune analyse unitaire requise : le coach global s'appuie directement sur tes données de jeu réelles.</span>
          </div>
        </div>
      </div>
      <div v-if="meta.qualitative_mode === 'unbalanced' || meta.unbalanced_causes" class="sample-warning-banner">
        ⚠️ <strong>Échantillon unitaire asymétrique :</strong> tu n’as analysé que des {{ (meta.n_game_reviews_available_losses ?? meta.n_game_reviews_losses ?? 0) > 0 ? "défaites" : "victoires" }}. Une seule est intégrée pour ne pas déformer le bilan, qui reste fondé sur tes {{ meta.n_games_me }} parties réelles. Analyse aussi une partie de l’autre issue pour équilibrer le contexte.
      </div>
      <div v-if="needsRefresh" class="sample-warning-banner refresh">
        <span>↻ Une nouvelle analyse de partie peut enrichir ce bilan.</span>
        <button type="button" class="btn btn-small" :disabled="busy" @click="emit('generate')">{{ authenticated ? "Actualiser le coaching" : "🔒 Actualiser le coaching" }}</button>
      </div>
    </div>

    <div v-if="review.review.next_focus" class="global-focus-hero">
      <div class="global-focus-content">
        <span class="global-focus-eyebrow">PRIORITÉ N°1 POUR PROGRESSER</span>
        <h3>{{ review.review.next_focus }}</h3>
        <p class="global-focus-hint">Ton levier majeur à appliquer dès ta prochaine partie pour débloquer ton rank-up.</p>
      </div>
      <FeedbackButtons kind="focus" :index="0" :state="feedback['focus,0']" :busy="feedbackBusy['focus,0']" :open-key="openFeedback" prompt @vote="submitFeedback" @tag="(kind, index, tag) => submitFeedback(kind, index, false, tag)" />
    </div>

    <div class="insight-grid">
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🛡️</span><h3>Forces</h3></div>
        <div v-for="(item, index) in review.review.strengths || []" :key="`strength-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(item.point) }}</h4>
          <p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p>
          <p v-if="item.cause" class="cause-line">Pourquoi : {{ item.cause }}</p>
          <div class="insight-card-footer">
            <span class="evidence-chip kind-strength">{{ item.evidence }}</span>
            <FeedbackButtons kind="strength" :index="index" :state="feedback[key('strength', index)]" :busy="feedbackBusy[key('strength', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">⚠️</span><h3>Erreurs récurrentes</h3></div>
        <div v-for="(item, index) in review.review.mistakes || []" :key="`mistake-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(item.point) }}</h4>
          <p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p>
          <p v-if="item.cause" class="cause-line">Pourquoi : {{ item.cause }}</p>
          <div class="insight-card-footer">
            <span class="evidence-chip kind-mistake">{{ item.evidence }}</span>
            <FeedbackButtons kind="mistake" :index="index" :state="feedback[key('mistake', index)]" :busy="feedbackBusy[key('mistake', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🔄</span><h3>Habitudes</h3></div>
        <div v-for="(habit, index) in review.review.habits || []" :key="`habit-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(habit) }}</h4>
          <p v-if="insightBody(habit)" class="insight-body">{{ insightBody(habit) }}</p>
          <div class="insight-card-footer" style="justify-content:flex-end">
            <FeedbackButtons kind="habit" :index="index" :state="feedback[key('habit', index)]" :busy="feedbackBusy[key('habit', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🎯</span><h3>Focus &amp; Confiance</h3></div>
        <div class="insight-card">
          <span class="choice-label">Plan de jeu conseillé</span>
          <p class="insight-body">{{ review.review.next_focus }}</p>
          <div class="confidence-meter" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-soft)">
            <span class="faint" style="font-size:11px">Niveau de confiance : </span>
            <strong style="color:var(--text);font-size:13px">{{ Math.round((review.review.confidence || 0) * 100) }}%</strong>
          </div>
        </div>
      </div>
    </div>

    <details v-if="reviews.length > 1" class="reviews-history">
      <summary class="muted">Historique des analyses précédentes ({{ reviews.length - 1 }})</summary>
      <button v-for="item in reviews.slice(1)" :key="item.ts" type="button" class="hist-row faint" @click="emit('review-select', item)">
        {{ formatDate(item.ts) }} · {{ item.model }} · {{ item.scope }} ({{ item.outcome_focus || "global" }})
        <span class="badge badge-scope">Voir →</span>
      </button>
    </details>
    <p v-if="feedbackError" class="feedback-error">{{ feedbackError }}</p>
  </div>
</template>
