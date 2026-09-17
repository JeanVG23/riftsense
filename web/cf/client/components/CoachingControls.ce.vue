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
