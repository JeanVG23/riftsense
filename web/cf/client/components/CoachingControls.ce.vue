<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { rankEmblem } from "../account-profile";
import { withAuthHeaders } from "../auth";

type CoachingView = "overall" | "games";
type CoachingOutcome = "loss" | "win" | "overall";

interface ScopeOption {
  id: string;
  label: string;
  rawLabel?: string;
  isTop?: boolean;
}

interface EvaluationReport {
  target_met?: boolean;
  objective?: {
    mistake_useful_rate?: number | null;
    n_game_reviews_annotated?: number;
    target_n?: number;
  };
}

const props = withDefaults(defineProps<{
  slug: string;
  view?: CoachingView;
  gameReviewsCount?: number;
  scopes?: ScopeOption[];
  scope?: string;
  outcome?: CoachingOutcome;
  authenticated?: boolean;
  busy?: boolean;
  evalRevision?: number;
}>(), {
  view: "overall",
  gameReviewsCount: 0,
  scopes: () => [],
  scope: "adc",
  outcome: "loss",
  authenticated: false,
  busy: false,
  evalRevision: 0,
});

const emit = defineEmits<{
  "view-change": [view: CoachingView];
  "scope-change": [scope: string];
  "outcome-change": [outcome: CoachingOutcome];
  generate: [];
}>();

const evaluation = ref<EvaluationReport | null>(null);
let requestSequence = 0;

function percent(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)} %`;
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
  <div class="coach-view-tabs" role="tablist" aria-label="Type de coaching">
    <button
      type="button"
      :class="{ active: view === 'overall' }"
      :aria-selected="view === 'overall'"
      @click="emit('view-change', 'overall')"
    >
      Coaching global
    </button>
    <button
      type="button"
      :class="{ active: view === 'games' }"
      :aria-selected="view === 'games'"
      @click="emit('view-change', 'games')"
    >
      Analyses de parties <span v-if="gameReviewsCount" class="coach-tab-count">{{ gameReviewsCount }}</span>
    </button>
  </div>

  <template v-if="view === 'overall'">
    <div v-if="evaluation" class="eval-strip">
      <div class="eval-head">
        <span class="eval-kicker">QUALITÉ MESURÉE</span>
        <strong>{{ evaluation.objective?.mistake_useful_rate == null ? "Pas encore de note" : `${percent(evaluation.objective.mistake_useful_rate)} d'erreurs jugées utiles` }}</strong>
        <span class="eval-meta">{{ evaluation.objective?.n_game_reviews_annotated || 0 }} / {{ evaluation.objective?.target_n || 10 }} analyses annotées</span>
        <span class="eval-badge" :class="evaluation.target_met ? 'met' : 'pending'">
          {{ evaluation.target_met ? "objectif atteint" : "objectif ≥70 %" }}
        </span>
      </div>
      <p class="eval-note">Ce taux vient de tes votes sur les erreurs des analyses par partie ; il est recalculé sans nouvel appel LLM.</p>
    </div>

    <section class="coach-builder" aria-labelledby="coach-builder-title">
      <div class="coaching-intro">
        <span class="coaching-kicker">ANALYSE GLOBALE &amp; HABITUDES</span>
        <h2 id="coach-builder-title">Prends du recul sur ton jeu</h2>
        <p>Explore tes habitudes comparées aux joueurs Challenger selon le périmètre et le résultat souhaités.</p>
      </div>
      <div class="coach-options">
        <div class="choice-group" role="group" aria-label="Parties à analyser">
          <span class="choice-label">Périmètre</span>
          <div class="segmented-choice">
            <button
              v-for="item in scopes"
              :key="item.id"
              type="button"
              :class="{ selected: scope === item.id }"
              :aria-pressed="scope === item.id"
              @click="emit('scope-change', item.id)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <div class="choice-group" role="group" aria-label="Résultat à analyser">
          <span class="choice-label">Résultat</span>
          <div class="segmented-choice">
            <button type="button" :class="{ selected: outcome === 'loss', 'loss-choice': outcome === 'loss' }" :aria-pressed="outcome === 'loss'" @click="emit('outcome-change', 'loss')">Défaites</button>
            <button type="button" :class="{ selected: outcome === 'win', 'win-choice': outcome === 'win' }" :aria-pressed="outcome === 'win'" @click="emit('outcome-change', 'win')">Victoires</button>
            <button type="button" :class="{ selected: outcome === 'overall' }" :aria-pressed="outcome === 'overall'" @click="emit('outcome-change', 'overall')">Global</button>
          </div>
        </div>
        <div class="coach-reference" aria-label="Référence : joueurs Challenger">
          <img class="coach-ref-emblem" :src="rankEmblem('challenger')" alt="Challenger" loading="lazy">
          <div><span>Référence</span><strong>Joueurs Challenger</strong></div>
        </div>
        <button class="btn btn-primary coach-generate" :disabled="busy" @click="emit('generate')">
          <span>{{ busy ? "Analyse en cours…" : (authenticated ? "Générer ce coaching" : "🔒 Déverrouiller le coaching") }}</span>
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
  grid-template-columns: minmax(205px, 1.1fr) minmax(245px, 1.25fr) minmax(150px, .75fr) auto;
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

.segmented-choice {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  gap: 3px;
  padding: 3px;
  background: var(--panel-2);
  border-radius: 8px;
}

.segmented-choice button {
  min-width: 0;
  min-height: 30px;
  padding: 5px 7px;
  overflow: hidden;
  color: var(--text-faint);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: var(--transition-fast);
}

.segmented-choice button:hover {
  color: var(--text);
  background: var(--surface-alt);
}

.segmented-choice button.selected {
  color: var(--primary-text);
  background: var(--primary-gradient);
  border-color: var(--primary);
  font-weight: 700;
}

.segmented-choice button.selected.loss-choice {
  color: var(--paper);
  background: var(--loss);
  border-color: var(--loss);
}

.segmented-choice button.selected.win-choice {
  color: var(--paper);
  background: var(--win);
  border-color: var(--win);
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
