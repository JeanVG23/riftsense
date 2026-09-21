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
      ? "Too many votes in a short period. Try again in an hour."
      : "Your vote was not saved. Try again in a moment.";
  } finally {
    feedbackBusy.value = { ...feedbackBusy.value, [itemKey]: false };
  }
}

watch([() => props.slug, () => props.review?.ts], loadFeedback, { immediate: true });
</script>

<template>
  <div v-if="loading" class="state">Loading analyses…</div>
  <div v-else-if="!review" class="state empty-state coach-empty-card">
    <div class="coach-empty-icon" style="font-size:32px;margin-bottom:8px">🎯</div>
    <strong>No overall coaching saved for {{ outcomeLabel(outcome) }} ({{ scopeName }})</strong>
    <p style="margin:6px 0 14px;color:var(--text-dim)">Generate a full comparative analysis to identify your strengths, mistakes, and habits against Challenger players.</p>
    <button class="btn btn-primary" :disabled="busy" @click="emit('generate')">
      {{ busy ? "Generating…" : (authenticated ? `Generate ${outcomeLabel(outcome)} analysis →` : "🔒 Sign in to generate →") }}
    </button>
  </div>

  <div v-else>
    <div class="meta-strip row wrap">
      <span class="num">{{ meta.n_games_me || 0 }} games analyzed</span>
      <span class="faint">compared with {{ meta.n_games_ref || 0 }} Challenger reference games</span>
      <span class="num">Win rate: {{ Math.round((meta.winrate_me || 0) * 100) }}%</span>
      <span class="badge" :class="outcome === 'win' ? 'badge-win' : (outcome === 'loss' ? 'badge-loss' : 'badge-neutral')">{{ outcomeLabel(outcome) }}</span>
      <span class="badge badge-scope">{{ scopeName }}</span>
      <span v-if="meta.low_sample" class="badge badge-loss">limited sample</span>
      <span class="faint">{{ review.model }}</span>
      <span class="faint">{{ formatDate(review.ts) }}</span>
    </div>

    <div class="sample-transparency-card">
      <div class="sample-transparency-main">
        <span class="sample-stat-icon">📊</span>
        <div class="sample-stat-text">
          <div class="sample-stat-header">
            <strong>Statistical basis: {{ meta.n_games_me || 0 }} real {{ scopeName }} games</strong>
            <span class="faint">· Actual win rate: {{ Math.round((meta.winrate_me || 0) * 100) }}%</span>
          </div>
          <div class="sample-stat-sub faint">
            <span v-if="meta.n_game_reviews_available != null">
              <strong>{{ meta.n_game_reviews_available || 0 }}</strong> per-game analyses available
              ({{ meta.n_game_reviews_available_wins || 0 }}W · {{ meta.n_game_reviews_available_losses || 0 }}L) ·
            </span>
            <span v-if="meta.n_game_reviews_used">
              ✦ <strong>{{ meta.n_game_reviews_used }}</strong> per-game analyses included
              ({{ meta.n_game_reviews_used_wins ?? meta.n_game_reviews_wins ?? 0 }}W · {{ meta.n_game_reviews_used_losses ?? meta.n_game_reviews_losses ?? 0 }}L)
            </span>
            <span v-else>✦ No per-game analysis required: overall coaching uses your real game data directly.</span>
          </div>
        </div>
      </div>
      <div v-if="meta.qualitative_mode === 'unbalanced' || meta.unbalanced_causes" class="sample-warning-banner">
        ⚠️ <strong>Unbalanced per-game sample:</strong> you have only analyzed {{ (meta.n_game_reviews_available_losses ?? meta.n_game_reviews_losses ?? 0) > 0 ? "losses" : "wins" }}. Only one is included to avoid distorting the review, which remains based on your {{ meta.n_games_me }} real games. Analyze a game with the opposite outcome to balance the context.
      </div>
      <div v-if="needsRefresh" class="sample-warning-banner refresh">
        <span>↻ A new game analysis can improve this review.</span>
        <button type="button" class="btn btn-small" :disabled="busy" @click="emit('generate')">{{ authenticated ? "Refresh coaching" : "🔒 Refresh coaching" }}</button>
      </div>
    </div>

    <div v-if="review.review.next_focus" class="global-focus-hero">
      <div class="global-focus-content">
        <span class="global-focus-eyebrow">YOUR #1 IMPROVEMENT PRIORITY</span>
        <h3>{{ review.review.next_focus }}</h3>
        <p class="global-focus-hint">The main adjustment to apply in your next game to start climbing.</p>
      </div>
      <FeedbackButtons kind="focus" :index="0" :state="feedback['focus,0']" :busy="feedbackBusy['focus,0']" :open-key="openFeedback" prompt @vote="submitFeedback" @tag="(kind, index, tag) => submitFeedback(kind, index, false, tag)" />
    </div>

    <div class="insight-grid">
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🛡️</span><h3>Strengths</h3></div>
        <div v-for="(item, index) in review.review.strengths || []" :key="`strength-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(item.point) }}</h4>
          <p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p>
          <p v-if="item.cause" class="cause-line">Why: {{ item.cause }}</p>
          <div class="insight-card-footer">
            <span class="evidence-chip kind-strength">{{ item.evidence }}</span>
            <FeedbackButtons kind="strength" :index="index" :state="feedback[key('strength', index)]" :busy="feedbackBusy[key('strength', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">⚠️</span><h3>Recurring mistakes</h3></div>
        <div v-for="(item, index) in review.review.mistakes || []" :key="`mistake-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(item.point) }}</h4>
          <p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p>
          <p v-if="item.cause" class="cause-line">Why: {{ item.cause }}</p>
          <div class="insight-card-footer">
            <span class="evidence-chip kind-mistake">{{ item.evidence }}</span>
            <FeedbackButtons kind="mistake" :index="index" :state="feedback[key('mistake', index)]" :busy="feedbackBusy[key('mistake', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🔄</span><h3>Habits</h3></div>
        <div v-for="(habit, index) in review.review.habits || []" :key="`habit-${index}`" class="insight-card">
          <h4 class="insight-title">{{ insightTitle(habit) }}</h4>
          <p v-if="insightBody(habit)" class="insight-body">{{ insightBody(habit) }}</p>
          <div class="insight-card-footer" style="justify-content:flex-end">
            <FeedbackButtons kind="habit" :index="index" :state="feedback[key('habit', index)]" :busy="feedbackBusy[key('habit', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🎯</span><h3>Focus &amp; Confidence</h3></div>
        <div class="insight-card">
          <span class="choice-label">Recommended game plan</span>
          <p class="insight-body">{{ review.review.next_focus }}</p>
          <div class="confidence-meter" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-soft)">
            <span class="faint" style="font-size:11px">Confidence: </span>
            <strong style="color:var(--text);font-size:13px">{{ Math.round((review.review.confidence || 0) * 100) }}%</strong>
          </div>
        </div>
      </div>
    </div>

    <details v-if="reviews.length > 1" class="reviews-history">
      <summary class="muted">Previous analyses ({{ reviews.length - 1 }})</summary>
      <button v-for="item in reviews.slice(1)" :key="item.ts" type="button" class="hist-row faint" @click="emit('review-select', item)">
        {{ formatDate(item.ts) }} · {{ item.model }} · {{ item.scope }} ({{ item.outcome_focus || "global" }})
        <span class="badge badge-scope">View →</span>
      </button>
    </details>
    <p v-if="feedbackError" class="feedback-error">{{ feedbackError }}</p>
  </div>
</template>

<style scoped>
.meta-strip {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  color: var(--text-dim);
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 11px;
}

.badge-scope {
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
}

.sample-transparency-card {
  margin-bottom: 18px;
  padding: 12px 18px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sample-transparency-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sample-stat-icon {
  font-size: 20px;
  line-height: 1;
}

.sample-stat-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}

.sample-stat-header strong {
  color: var(--text);
  font-weight: 600;
}

.sample-stat-sub {
  font-size: 12px;
  color: var(--text-dim);
}

.sample-warning-banner {
  padding: 8px 12px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--gold-deep);
  line-height: 1.45;
}

.sample-warning-banner.refresh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.global-focus-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 22px;
  margin-bottom: 20px;
  background:
    var(--surface-alt);
  border: 1px solid var(--primary-border);
  border-left: 4px solid var(--primary);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
}

.global-focus-content {
  flex: 1;
  min-width: 0;
}

.global-focus-eyebrow {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
  color: var(--primary);
  margin-bottom: 6px;
}

.global-focus-hero h3 {
  margin: 0 0 6px;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -.02em;
}

.global-focus-hint {
  margin: 0;
  color: var(--text-dim);
  font-size: 12px;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.insight-col {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.col-icon {
  font-size: 15px;
}

.insight-col h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.insight-col:nth-child(1) h3 { color: var(--win); }
.insight-col:nth-child(2) h3 { color: var(--loss); }
.insight-col:nth-child(3) h3 { color: var(--info); }
.insight-col:nth-child(4) h3 { color: var(--primary); }

.insight-card {
  padding: 12px 0;
  border-top: 1px solid var(--border-soft);
}

.insight-col .insight-card:first-of-type {
  border-top: none;
  padding-top: 0;
}

.insight-title {
  margin: 0 0 5px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.insight-body {
  margin: 0 0 7px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.cause-line {
  margin: 0 0 7px;
  color: var(--text-dim);
  font-size: 11.5px;
  line-height: 1.45;
}

.insight-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.evidence-chip {
  display: inline-block;
  font-size: 11px;
  color: var(--text-dim);
  background: var(--panel-2);
  border-left: 3px solid var(--border);
  padding: 4px 8px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  max-width: 100%;
  line-height: 1.4;
}

.evidence-chip.kind-strength { border-left-color: var(--win); }
.evidence-chip.kind-mistake { border-left-color: var(--loss); }

.confidence-meter {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}

.reviews-history {
  margin-top: 18px;
  padding: 6px 16px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.reviews-history summary {
  cursor: pointer;
  font-size: 13px;
  padding: 8px 0;
  color: var(--text-dim);
  font-weight: 600;
}

.hist-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--border-soft);
  transition: background 140ms ease;
  width: 100%;
  color: inherit;
  background: transparent;
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.hist-row:hover {
  color: var(--text);
}

.feedback-error {
  margin: 12px 0 0;
  color: var(--loss);
  font-size: 12px;
}

@media (max-width: 640px) {
  .insight-grid {
    grid-template-columns: 1fr;
  }
  .insight-col:nth-child(4) .insight-card > p {
    font-size: 15px;
  }
}
</style>
