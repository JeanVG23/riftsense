<script setup lang="ts">
import { ref, watch } from "vue";
import { formatDate } from "../account-profile";
import { insightBody, insightTitle } from "../coaching";
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

interface AggregateReview {
  ts: string;
  model?: string;
  scope?: string;
  outcome_focus?: string;
  review: ReviewContent;
}

interface FeedbackValue {
  useful: boolean;
  tag?: string | null;
  note?: string | null;
}

const props = withDefaults(defineProps<{
  slug: string;
  review?: AggregateReview | null;
  reviews?: AggregateReview[];
  loading?: boolean;
  scope?: string;
  scopeName?: string;
  authenticated?: boolean;
  busy?: boolean;
}>(), {
  review: null,
  reviews: () => [],
  loading: false,
  scope: "",
  scopeName: "",
  authenticated: false,
  busy: false,
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
    <div class="coach-empty-icon">🎯</div>
    <strong>{{ scope ? "No global coaching saved yet" : "Main role not detected yet" }}</strong>
    <p class="coach-empty-copy">{{ scope ? `Generate one synthesis for your main role (${scopeName}), combining wins and losses.` : "Refresh the account first so coaching and ML & SHAP use the same main role." }}</p>
    <button class="btn btn-primary" :disabled="busy || !scope" @click="emit('generate')">
      {{ busy ? "Generating…" : (authenticated ? "Generate global coaching →" : "🔒 Sign in to generate →") }}
    </button>
  </div>

  <div v-else>
    <div v-if="review.review.next_focus" class="global-focus-hero">
      <div class="global-focus-content">
        <span class="global-focus-eyebrow">YOUR #1 IMPROVEMENT PRIORITY</span>
        <h3>{{ review.review.next_focus }}</h3>
        <p class="global-focus-hint">The main adjustment to apply in your next game to start climbing.</p>
      </div>
      <FeedbackButtons kind="focus" :index="0" :state="feedback['focus,0']" :busy="feedbackBusy['focus,0']" :open-key="openFeedback" prompt @vote="submitFeedback" @tag="(kind, index, tag) => submitFeedback(kind, index, false, tag)" />
    </div>

      <div class="insight-grid shared-insights">
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🛡️</span><h3>Strengths</h3></div>
        <div v-for="(item, index) in review.review.strengths || []" :key="`strength-${index}`" class="insight-card card-accent-strength">
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
        <div v-for="(item, index) in review.review.mistakes || []" :key="`mistake-${index}`" class="insight-card card-accent-mistake">
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
        <div v-for="(habit, index) in review.review.habits || []" :key="`habit-${index}`" class="insight-card card-accent-habit">
          <h4 class="insight-title">{{ insightTitle(habit) }}</h4>
          <p v-if="insightBody(habit)" class="insight-body">{{ insightBody(habit) }}</p>
          <div class="insight-card-footer insight-card-footer--end">
            <FeedbackButtons kind="habit" :index="index" :state="feedback[key('habit', index)]" :busy="feedbackBusy[key('habit', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" />
          </div>
        </div>
      </div>
      <div class="card insight-col">
        <div class="col-head"><span class="col-icon">🎯</span><h3>Focus &amp; Confidence</h3></div>
        <div class="insight-card card-accent-focus">
          <span class="choice-label">Recommended game plan</span>
          <p class="insight-body">{{ review.review.next_focus }}</p>
          <div class="confidence-meter">
            <span class="faint confidence-label">Confidence: </span>
            <strong class="confidence-value">{{ Math.round((review.review.confidence || 0) * 100) }}%</strong>
          </div>
        </div>
      </div>
    </div>

    <details v-if="reviews.length > 1" class="reviews-history">
      <summary class="muted">Previous analyses ({{ reviews.length - 1 }})</summary>
      <button v-for="item in reviews.slice(1)" :key="item.ts" type="button" class="hist-row faint" @click="emit('review-select', item)">
        {{ formatDate(item.ts) }} · {{ item.model }} · global coaching
        <span class="badge badge-scope">View →</span>
      </button>
    </details>
    <p v-if="feedbackError" class="feedback-error">{{ feedbackError }}</p>
  </div>
</template>

<style scoped>
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
  font-size: var(--fs-label);
  font-weight: 800;
  letter-spacing: .08em;
  color: var(--primary);
  margin-bottom: 6px;
}

.global-focus-hero h3 {
  margin: 0 0 6px;
  color: var(--text);
  font-size: var(--fs-lead);
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -.02em;
}

.global-focus-hint {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--fs-small);
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

.insight-col h3 {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: 750;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.insight-col:nth-child(1) h3 { color: var(--win); }
.insight-col:nth-child(2) h3 { color: var(--loss); }
.insight-col:nth-child(3) h3 { color: var(--info); }
.insight-col:nth-child(4) h3 { color: var(--primary); }

.insight-card {
  padding: 12px 0 12px 10px;
  border-top: 1px solid var(--border-soft);
}

.insight-col .insight-card:first-of-type {
  border-top: none;
  padding-top: 0;
}

.cause-line {
  margin: 0 0 7px;
  color: var(--text-dim);
  font-size: var(--fs-label);
  line-height: 1.45;
}

.confidence-meter {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}

.reviews-history {
  margin-top: 18px;
  padding: 6px 16px;
  background: var(--card-marble-bg);
  border: 1px solid var(--card-marble-border);
  border-radius: 10px;
  box-shadow: var(--card-shadow);
}

.reviews-history summary {
  cursor: pointer;
  font-size: var(--fs-body-sm);
  padding: 8px 0;
  color: var(--text-dim);
  font-weight: 600;
}

.hist-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-small);
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
  font-size: var(--fs-small);
}

.coach-empty-icon {
  margin-bottom: 8px;
  font-size: var(--fs-display);
}

.coach-empty-copy {
  margin: 6px 0 14px;
  color: var(--text-dim);
}

.confidence-label { font-size: var(--fs-label); }

.confidence-value {
  color: var(--text);
  font-size: var(--fs-body-sm);
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
