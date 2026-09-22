<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { rankEmblem } from "../account-profile";
import { withAuthHeaders } from "../auth";
import { categoryLabel } from "../coaching";

type CoachingView = "overall" | "games";

interface EvaluationReport {
  target_met?: boolean;
  objective?: {
    mistake_useful_rate?: number | null;
    n_game_reviews_annotated?: number;
    target_n?: number;
  };
  by_category?: Record<string, { n: number; useful: number; rate: number | null }>;
}

const props = withDefaults(defineProps<{
  slug: string;
  view?: CoachingView;
  gameReviewsCount?: number;
  mainRoleName?: string;
  roleReady?: boolean;
  authenticated?: boolean;
  busy?: boolean;
  evalRevision?: number;
}>(), {
  view: "overall",
  gameReviewsCount: 0,
  mainRoleName: "",
  roleReady: false,
  authenticated: false,
  busy: false,
  evalRevision: 0,
});

const emit = defineEmits<{
  "view-change": [view: CoachingView];
  generate: [];
}>();

const evaluation = ref<EvaluationReport | null>(null);
const categoryScores = computed(() => Object.entries(evaluation.value?.by_category || {})
  .filter(([category, score]) => category !== "none" && score.n > 0)
  .sort((left, right) => right[1].n - left[1].n));
let requestSequence = 0;

function percent(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

async function loadEvaluation(): Promise<void> {
  const sequence = ++requestSequence;
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(props.slug)}/eval`, {
      headers: withAuthHeaders(),
    });
    const next = response.ok ? await response.json() as EvaluationReport : null;
    if (sequence === requestSequence) evaluation.value = next;
  } catch {
    if (sequence === requestSequence) evaluation.value = null;
  }
}

watch([() => props.slug, () => props.evalRevision], loadEvaluation);
onMounted(loadEvaluation);
</script>

<template>
  <div class="coach-view-tabs" role="tablist" aria-label="Coaching type">
    <button
      type="button"
      :class="{ active: view === 'overall' }"
      :aria-selected="view === 'overall'"
      @click="emit('view-change', 'overall')"
    >
      Global coaching
    </button>
    <button
      type="button"
      :class="{ active: view === 'games' }"
      :aria-selected="view === 'games'"
      @click="emit('view-change', 'games')"
    >
      Game analyses <span v-if="gameReviewsCount" class="coach-tab-count">{{ gameReviewsCount }}</span>
    </button>
  </div>

  <template v-if="view === 'overall'">
    <div v-if="evaluation" class="eval-strip">
      <div class="eval-head">
        <span class="eval-kicker">MEASURED QUALITY</span>
        <strong>{{ evaluation.objective?.mistake_useful_rate == null ? "No ratings yet" : `${percent(evaluation.objective.mistake_useful_rate)} of mistakes rated useful` }}</strong>
        <span class="eval-meta">{{ evaluation.objective?.n_game_reviews_annotated || 0 }} / {{ evaluation.objective?.target_n || 10 }} rated analyses</span>
        <span class="eval-badge" :class="evaluation.target_met ? 'met' : 'pending'">
          {{ evaluation.target_met ? "target met" : "target ≥70%" }}
        </span>
      </div>
      <p class="eval-note">This rate comes from your votes on per-game analysis mistakes. It is recalculated without another LLM call.</p>
      <div v-if="categoryScores.length" class="eval-categories" aria-label="Usefulness by coaching category">
        <span v-for="[category, score] in categoryScores" :key="category">
          {{ categoryLabel(category) }}: <strong>{{ percent(score.rate) }}</strong> <small>n={{ score.n }}</small>
        </span>
      </div>
    </div>

    <section class="coach-builder" aria-labelledby="coach-builder-title">
      <div class="coaching-intro">
        <span class="coaching-kicker">GLOBAL ANALYSIS &amp; HABITS</span>
        <h2 id="coach-builder-title">See the bigger picture</h2>
        <p>One clear synthesis of your reviewed games, automatically adapted to your main role.</p>
      </div>
      <div class="coach-options">
        <div class="choice-group main-role-card" aria-label="Detected main role">
          <span class="choice-label">Main role detected</span>
          <strong>{{ mainRoleName || "Refresh required" }}</strong>
          <small>{{ roleReady ? "Shared with your ML & SHAP profile" : "Refresh the account to detect your main role" }}</small>
        </div>
        <div class="coach-reference" aria-label="Reference: Challenger players">
          <img class="coach-ref-emblem" :src="rankEmblem('challenger')" alt="Challenger" loading="lazy">
          <div><span>Reference</span><strong>Challenger players</strong></div>
        </div>
        <button class="btn btn-primary coach-generate" :disabled="busy || !roleReady" @click="emit('generate')">
          <span>{{ busy ? "Analyzing…" : (authenticated ? "Generate coaching" : "🔒 Unlock coaching") }}</span>
          <span v-if="!busy" aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  </template>
</template>

<style scoped>
.coach-view-tabs {
  display: flex;
  width: max-content;
  max-width: 100%;
  gap: 4px;
  padding: 4px;
  margin: 0 0 18px;
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.coach-view-tabs button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 12px;
  color: var(--text-dim);
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  transition: var(--transition-fast);
}

.coach-view-tabs button:hover {
  color: var(--text);
  background: var(--surface-alt);
}

.coach-view-tabs button.active {
  color: var(--primary-text);
  background: var(--primary-gradient);
}

.coach-tab-count {
  display: grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  color: inherit;
  background: rgba(255, 253, 248, .18);
  border-radius: 999px;
  font-size: 10px;
}

.eval-strip {
  margin: 0 0 16px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: 8px;
  background: var(--panel);
}

.eval-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.eval-head strong {
  font-size: 16px;
  color: var(--text);
}

.eval-kicker {
  font-size: 11px;
  letter-spacing: .08em;
  color: var(--primary);
  font-weight: 700;
}

.eval-meta {
  font-size: 12px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.eval-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
}

.eval-badge.met {
  color: var(--win);
}

.eval-badge.pending {
  color: var(--text-faint);
}

.eval-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}

.eval-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.eval-categories > span {
  padding: 3px 8px;
  color: var(--text-dim);
  background: var(--surface-alt);
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  font-size: 10px;
}

.eval-categories small {
  color: var(--text-faint);
}

.coach-builder {
  padding: 22px;
  margin-bottom: 22px;
  background:
    linear-gradient(120deg, var(--primary-soft), transparent 45%),
    var(--panel-gradient);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
}

.coach-builder .coaching-intro {
  margin: 0 0 18px;
}

.coach-builder .coaching-kicker {
  display: block;
  margin-bottom: 5px;
  font-size: 10px;
  letter-spacing: .12em;
}

.coach-builder .coaching-intro h2 {
  color: var(--text);
  font-size: 19px;
  letter-spacing: -.025em;
}

.coach-builder .coaching-intro p {
  max-width: 630px;
  margin: 5px 0 0;
  color: var(--text-dim);
  font-size: 13px;
}

.coach-options {
  display: grid;
  grid-template-columns: minmax(205px, 1fr) minmax(245px, 1.15fr) auto;
  gap: 10px;
  align-items: stretch;
}

.choice-group,
.coach-reference {
  min-width: 0;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.choice-label {
  display: block;
  margin: 0 0 6px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.main-role-card strong,
.main-role-card small {
  display: block;
}

.main-role-card strong {
  color: var(--text);
  font-size: 15px;
}

.main-role-card small {
  margin-top: 3px;
  color: var(--text-faint);
  font-size: 10px;
}

.coach-reference {
  display: flex;
  gap: 10px;
  align-items: center;
}

.coach-ref-emblem {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.coach-reference span {
  display: block;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.coach-reference strong {
  display: block;
  margin-top: 2px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.2;
}

.coach-generate {
  align-self: stretch;
  min-height: 62px;
  padding: 10px 16px;
  white-space: nowrap;
}

.coach-generate span {
  margin-left: 5px;
  font-size: 16px;
}

@media (max-width: 640px) {
  .coach-builder {
    padding: 18px;
    border-radius: 14px;
  }
  .coach-options {
    grid-template-columns: 1fr;
  }
  .coach-reference {
    min-height: 54px;
  }
  .coach-generate {
    min-height: 44px;
  }
  .coach-view-tabs {
    width: 100%;
  }
  .coach-view-tabs button {
    flex: 1 0 auto;
    justify-content: center;
  }
}
</style>
