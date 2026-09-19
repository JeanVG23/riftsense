<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { formatDate } from "../account-profile";
import { withAuthHeaders } from "../auth";
import type { IngestSync } from "../ingest-sync";
import {
  boundaryLabel,
  formatLogit,
  isGlobalClosure,
  parseRoleAnalysis,
  reasonMessage,
  roleLabel,
  type RoleAnalysis,
  type RoleDriver,
} from "../role-analysis";

const props = defineProps<{ slug: string; sync: IngestSync; reloadToken: number }>();

/** Palette alignée sur le thème Targon : or, encre et ivoire. */
const palette = {
  gold: "#b98f53",
  loss: "#8c5a55",
  border: "#e5e0d6",
  dim: "#4a545b",
  ink: "#141718",
};

const loading = ref(true);
const analysis = ref<RoleAnalysis | null>(null);
const unavailableReason = ref<string | null>(null);
const sort = ref<"abs" | "val">("abs");
const categoryFilter = ref<"all" | "actionable">("all");
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: import("chart.js").Chart | null = null;
let requestSequence = 0;
let chartRuntime: Promise<typeof import("chart.js")> | null = null;

/** Info-bulle du bouton d'actualisation, partagée par les deux branches du
 * template (états disponible et indisponible) : le markup reste dupliqué,
 * la chaîne vit ici une seule fois. */
const refreshTitle = computed(() => props.sync.cooling
  ? "Analyse déjà actualisée : une nouvelle est possible toutes les 15 minutes"
  : "Recollecter les 20 dernières parties du rôle et recalculer la décomposition");

/** Libellé du bouton d'actualisation, partagé par les deux branches du
 * template : feedback du composable d'abord, sinon l'état (collecte en
 * cours, cooldown avec décompte, repos). */
const refreshLabel = computed(() => props.sync.feedback
  || (props.sync.syncing
    ? "Actualisation…"
    : (props.sync.cooling ? props.sync.cooldownLabel : "Actualiser l'analyse")));

/** Vrai quand le motif d'indisponibilité courant est l'un des trois motifs
 * structurels (`role_closed`, `model_missing`, `model_mismatch`) : décidés
 * par les artefacts déployés, donc identiques pour tout compte du site.
 * Calculé une fois ici, comme `refreshTitle`/`refreshLabel`, pour que le
 * bouton d'actualisation et le bloc démo ne dupliquent pas cette logique. */
const isGlobalUnavailable = computed(() =>
  unavailableReason.value !== null && isGlobalClosure(unavailableReason.value));

/** Filtre de catégorie, puis tri |contribution| ou valeur, puis top 16.
 * Le descriptif s'affiche mais ne se formule jamais en levier : le filtre
 * « Leviers d'action uniquement » isole l'actionable, l'inverse n'existe pas.
 * En computed (pas une fonction) : évite de recalculer filtre + tri + slice
 * à chaque rendu, et sert aussi de garde d'affichage (liste vide → message
 * dédié plutôt qu'un canvas vide de 560px, cf. template). */
const visibleDrivers = computed<RoleDriver[]>(() => {
  const drivers = [...(analysis.value?.drivers || [])];
  const kept = categoryFilter.value === "actionable"
    ? drivers.filter((driver) => driver.category === "actionable")
    : drivers;
  kept.sort(sort.value === "abs"
    ? (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution)
    : (left, right) => right.contribution - left.contribution);
  return kept.slice(0, 16);
});

/** Label d'un driver : la `base` (nom technique sans suffixe d'agrégation,
 * spec §3 « libellés français des noms de features » : le suffixe ne s'affiche
 * pas), désambiguisée en nom complet quand deux agrégations visibles
 * partagent la même base (« csm10__mean » et « csm10__max ») : la base seule
 * ne permettrait plus de dire laquelle des deux est laquelle. Le marqueur
 * « (contexte) » est ajouté APRÈS cette désambiguation, sur le libellé déjà
 * choisi : il ne doit jamais changer quelles bases sont considérées comme
 * partagées, seulement le texte final affiché. Sans lui, en vue « Tout », une
 * barre descriptive à forte contribution négative est visuellement
 * indiscernable d'un levier (invariant PUBLIC_DESCRIPTIVE : jamais formulée
 * comme quelque chose à travailler). */
function driverLabel(driver: RoleDriver, visible: RoleDriver[]): string {
  const base = driver.base || driver.feature;
  const sameBase = visible.filter((other) => (other.base || other.feature) === base);
  const label = sameBase.length > 1 ? driver.feature : base;
  return driver.category === "actionable" ? label : `${label} (contexte)`;
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
}

async function renderChart(): Promise<void> {
  destroyChart();
  if (!canvas.value || !analysis.value) return;
  chartRuntime ||= import("chart.js");
  const { Chart, registerables } = await chartRuntime;
  Chart.register(...registerables);
  if (!canvas.value?.isConnected || !analysis.value) return;
  const drivers = visibleDrivers.value;
  chart = new Chart(canvas.value, {
    type: "bar",
    data: {
      labels: drivers.map((driver) => driverLabel(driver, drivers)),
      datasets: [{
        data: drivers.map((driver) => driver.contribution),
        backgroundColor: drivers.map((driver) => driver.contribution >= 0 ? palette.gold : palette.loss),
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: (context) => {
          const driver = drivers[context.dataIndex];
          if (!driver) return `EBM ${Number(context.raw).toFixed(4)}`;
          const lines = [`Contribution ${driver.contribution.toFixed(4)}`];
          if (driver.value !== null) lines.push(`Valeur ${driver.value}`);
          lines.push(driver.category === "actionable" ? "Levier" : "Contexte");
          if (driver.crossover_value !== null) lines.push(`Bascule ≈ ${driver.crossover_value}`);
          return lines;
        },
      } } },
      scales: {
        x: { grid: { color: palette.border }, ticks: { color: palette.dim, font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { color: palette.ink, font: { size: 11 } } },
      },
    },
  });
}

async function loadAnalysis(): Promise<void> {
  const sequence = ++requestSequence;
  loading.value = true;
  analysis.value = null;
  unavailableReason.value = null;
  destroyChart();
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(props.slug)}/shap-role`, {
      headers: withAuthHeaders(),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = parseRoleAnalysis(await response.json());
    if (sequence !== requestSequence) return;
    if (payload.available) analysis.value = payload;
    else unavailableReason.value = payload.reason;
  } catch {
    // Échec réseau côté client : motif propre, jamais déguisé en attente de
    // première collecte (ce serait faux pour un simple échec de chargement).
    if (sequence === requestSequence) unavailableReason.value = "fetch_failed";
  } finally {
    if (sequence === requestSequence) {
      loading.value = false;
      await nextTick();
      await renderChart();
    }
  }
}

async function toggleSort(): Promise<void> {
  sort.value = sort.value === "abs" ? "val" : "abs";
  await renderChart();
}

async function toggleCategory(): Promise<void> {
  categoryFilter.value = categoryFilter.value === "all" ? "actionable" : "all";
  // Ce filtre peut faire passer visibleDrivers à/depuis zéro élément : le
  // canvas vit derrière un v-if sur ce compte (cf. template), donc attendre
  // le patch DOM avant renderChart() garantit que `canvas` pointe sur
  // l'élément réel (recréé le cas échéant), jamais sur un noeud détaché.
  await nextTick();
  await renderChart();
}

function goToAccount(targetSlug: string): void {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path: `/c/${targetSlug}?tab=shap` } }));
}

watch(() => props.slug, loadAnalysis);
watch(() => props.reloadToken, loadAnalysis);
onMounted(loadAnalysis);
onBeforeUnmount(destroyChart);
</script>

<template>
  <div class="shap-container">
    <div v-if="loading" class="state">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Chargement du profil ML…</span>
    </div>
    <div v-else-if="unavailableReason" class="shap-empty-card">
      <div class="shap-unavail-badge">
        <span class="badge badge-region">MODÈLE EBM &amp; SHAP</span>
      </div>
      <h3 class="shap-unavail-title">Analyse ML indisponible pour ce compte.</h3>
      <p class="shap-unavail-sub faint">{{ reasonMessage(unavailableReason) }}</p>

      <!-- Le bouton vit AUSSI dans l'état indisponible : les motifs
           collection_incomplete et scoring_failed disent « relance
           l'actualisation », le CTA doit exister là où on l'appelle. Retiré
           pour les trois motifs structurels (role_closed, model_missing,
           model_mismatch) : décidés par les artefacts déployés, une
           re-collecte ne peut rien y changer, et le clic consommerait pour
           rien le cooldown partagé avec le bouton « Actualiser les données »
           du hero (une seule instance de sync pour toute la page). -->
      <div v-if="!isGlobalUnavailable" class="shap-unavail-actions">
        <button
          class="btn btn-sort-shap btn-refresh-shap"
          :class="{ 'is-syncing': sync.syncing, 'is-cooling': sync.cooling }"
          :disabled="sync.syncing || sync.cooling"
          type="button"
          :title="refreshTitle"
          @click="sync.trigger"
        >
          <svg class="sync-icon-shap" :class="{ spinning: sync.syncing }" viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
          </svg>
          {{ refreshLabel }}
        </button>
      </div>

      <!-- Les comptes démo montrent une analyse EN DIRECT. Pour les trois
           motifs structurels, ces comptes rendraient la MÊME carte
           indisponible (motif global, identique pour tout compte) : le CTA
           promettrait un palier et une décomposition que la destination ne
           peut pas montrer, retiré pour ces trois motifs uniquement. -->
      <div v-if="!isGlobalUnavailable" class="shap-demo-guidance">
        <span class="demo-guidance-title">Explorer le modèle d'explicabilité SHAP en direct sur nos profils calibrés :</span>
        <div class="demo-guidance-buttons">
          <a class="btn btn-demo-shap" href="/c/spadzze?tab=shap" @click.prevent="goToAccount('spadzze')">
            <span class="demo-shap-avatar">🛡️</span>
            <div class="demo-shap-info">
              <span class="demo-shap-name">Spadzze#euw</span>
              <span class="demo-shap-desc">Palier estimé : Diamond · 24 facteurs SHAP décomposés</span>
            </div>
            <span class="demo-shap-arrow" aria-hidden="true">→</span>
          </a>
          <a class="btn btn-demo-shap" href="/c/aceofspadzze?tab=shap" @click.prevent="goToAccount('aceofspadzze')">
            <span class="demo-shap-avatar">👑</span>
            <div class="demo-shap-info">
              <span class="demo-shap-name">AceOfSpadzze#EQ4</span>
              <span class="demo-shap-desc">Palier estimé : Grandmaster · Calibration EBM</span>
            </div>
            <span class="demo-shap-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </div>
    <div v-else-if="analysis" class="shap-active-card">
      <div class="shap-header-row">
        <div>
          <div class="eyebrow-shap">EXPLICABILITÉ DU MODÈLE</div>
          <h2>Ce qui influence ton profil ML</h2>
        </div>
        <div class="spacer"></div>
        <button
          class="btn btn-sort-shap btn-refresh-shap"
          :class="{ 'is-syncing': sync.syncing, 'is-cooling': sync.cooling }"
          :disabled="sync.syncing || sync.cooling"
          type="button"
          :title="refreshTitle"
          @click="sync.trigger"
        >
          <svg class="sync-icon-shap" :class="{ spinning: sync.syncing }" viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
          </svg>
          {{ refreshLabel }}
        </button>
        <button class="btn btn-sort-shap" type="button" @click="toggleCategory">
          {{ categoryFilter === "all" ? "Tout" : "Leviers d'action uniquement" }}
        </button>
        <button class="btn btn-sort-shap" type="button" @click="toggleSort">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true" style="margin-right:6px">
            <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
          </svg>
          {{ sort === "abs" ? "Trier par impact" : "Trier par valeur" }}
        </button>
      </div>

      <div class="shap-context-band">
        <span>Analyse sur {{ analysis.sample?.role_games_used ?? "?" }} dernières parties {{ roleLabel(analysis.role) }}</span>
        <span v-if="analysis.generated_at">générée le {{ formatDate(analysis.generated_at) }}</span>
      </div>

      <div class="shap-score-block">
        <span class="shap-score-label">Proximité à l'apex</span>
        <strong class="shap-score-value">{{ analysis.logit !== null && analysis.logit !== undefined ? formatLogit(analysis.logit) : "?" }}</strong>
        <span v-if="analysis.model?.boundary" class="shap-score-boundary">Frontière {{ boundaryLabel(analysis.model.boundary) }}</span>
        <span v-if="analysis.model?.auc_heldout_median !== undefined" class="shap-score-meta">
          Modèle EBM {{ roleLabel(analysis.role) }} · AUC médiane {{ analysis.model.auc_heldout_median }} sur {{ analysis.model.n_seeds ?? "?" }} tirages
        </span>
      </div>

      <div class="shap-legend-strip">
        <div class="shap-legend-item">
          <span class="legend-box legend-box--gold" aria-hidden="true"></span>
          <span><strong>Contribution positive</strong> : facteurs qui rapprochent de l'apex</span>
        </div>
        <div class="shap-legend-item">
          <span class="legend-box legend-box--loss" aria-hidden="true"></span>
          <span><strong>Contribution négative</strong> : facteurs qui éloignent de l'apex</span>
        </div>
        <div class="shap-legend-item">
          <span><strong>« (contexte) »</strong> dans un libellé : décrit ta fenêtre de parties, ne se formule jamais comme un levier à travailler</span>
        </div>
      </div>

      <p class="muted shap-explainer-text">
        Décomposition exacte du modèle Explainable Boosting Machine (EBM) : chaque barre mesure la contribution marginale (log-odds) de l'indicateur à ta proximité à l'apex. Les facteurs marqués « (contexte) » décrivent ta fenêtre de parties et ne se travaillent pas ; les autres sont des leviers.
      </p>

      <div v-if="visibleDrivers.length" class="shap-wrap"><canvas ref="canvas"></canvas></div>
      <p v-else class="shap-empty">
        {{ analysis.drivers.length === 0
          ? "Aucun facteur n'a été publié pour cette fenêtre de parties."
          : "Aucun levier d'action parmi les facteurs publiés : reviens sur « Tout » pour voir les facteurs de contexte." }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.shap-container {
  margin-top: 10px;
}

.shap-empty-card {
  padding: 32px 28px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  text-align: center;
  max-width: 680px;
  margin: 20px auto;
}

.shap-unavail-title {
  font-size: 18px;
  color: var(--text);
  margin: 12px 0 8px;
}

.shap-unavail-sub {
  font-size: 13px;
  line-height: 1.5;
  max-width: 500px;
  margin: 0 auto 24px;
}

.shap-unavail-actions {
  display: flex;
  justify-content: center;
  margin: 0 auto 24px;
}

.shap-demo-guidance {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  text-align: left;
}

.demo-guidance-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--primary);
}

.demo-guidance-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-demo-shap {
  flex: 1 1 240px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  color: var(--text);
  text-decoration: none;
  transition: var(--transition-base);
}
.btn-demo-shap:hover {
  background: var(--panel-hover);
  border-color: var(--primary);
  transform: translateY(-1px);
  text-decoration: none;
}

.demo-shap-avatar {
  font-size: 18px;
}

.demo-shap-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.demo-shap-name {
  font-size: 13px;
  font-weight: 750;
  color: var(--text);
}

.demo-shap-desc {
  font-size: 11px;
  color: var(--text-faint);
}

.demo-shap-arrow {
  color: var(--primary);
  font-weight: 700;
}

.shap-active-card {
  padding: 24px;
  background: var(--panel-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
}

.shap-header-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.eyebrow-shap {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .06em;
  color: var(--primary);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.btn-sort-shap {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 650;
}

.btn-refresh-shap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-refresh-shap:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.sync-icon-shap.spinning {
  animation: spin-shap .9s linear infinite;
}

@keyframes spin-shap {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.shap-context-band {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0 0 14px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-dim);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.shap-score-block {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0 0 14px;
}

.shap-score-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.shap-score-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--ink);
}

.shap-score-boundary {
  font-size: 12px;
  color: var(--text-dim);
}

.shap-score-meta {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--text-faint);
}

.shap-legend-strip {
  display: flex;
  gap: 18px;
  margin: 8px 0 14px;
  padding: 10px 14px;
  background: var(--surface-alt);
  border-radius: 8px;
  border: 1px solid var(--border);
  flex-wrap: wrap;
}

.shap-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
}

.legend-box {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}
.legend-box--gold { background: var(--gold); }
.legend-box--loss { background: var(--danger); }

.shap-explainer-text {
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 16px;
  max-width: 860px;
}

.shap-wrap {
  height: 560px;
  position: relative;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  padding: 16px;
}

.shap-empty {
  padding: 48px 20px;
  line-height: 1.7;
  text-align: center;
  color: var(--text-dim);
  background: var(--panel);
  border: 1px dashed var(--border);
  border-radius: 14px;
}

@media (max-width: 860px) {
  .shap-wrap {
    height: 440px;
    padding: 10px;
  }
}
</style>
