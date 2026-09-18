<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { withAuthHeaders } from "../auth";

interface ShapDriver {
  feature: string;
  contribution: number;
}

interface ShapReport {
  available: boolean;
  drivers?: ShapDriver[];
}

const props = defineProps<{ slug: string }>();

/** Palette alignée sur le thème Targon : or, encre et ivoire. */
const palette = {
  gold: "#b98f53",
  loss: "#8c5a55",
  border: "#e5e0d6",
  dim: "#4a545b",
  ink: "#141718",
};

const loading = ref(true);
const report = ref<ShapReport | null>(null);
const sort = ref<"abs" | "val">("abs");
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: import("chart.js").Chart | null = null;
let requestSequence = 0;
let chartRuntime: Promise<typeof import("chart.js")> | null = null;

function sortedDrivers(): ShapDriver[] {
  const drivers = [...(report.value?.drivers || [])];
  drivers.sort(sort.value === "abs"
    ? (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution)
    : (left, right) => right.contribution - left.contribution);
  return drivers.slice(0, 16);
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
}

async function renderChart(): Promise<void> {
  destroyChart();
  if (!canvas.value || !report.value?.available) return;
  chartRuntime ||= import("chart.js");
  const { Chart, registerables } = await chartRuntime;
  Chart.register(...registerables);
  if (!canvas.value?.isConnected || !report.value?.available) return;
  const drivers = sortedDrivers();
  chart = new Chart(canvas.value, {
    type: "bar",
    data: {
      labels: drivers.map((driver) => driver.feature),
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
        label: (context) => `EBM ${Number(context.raw).toFixed(4)}`,
      } } },
      scales: {
        x: { grid: { color: palette.border }, ticks: { color: palette.dim, font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { color: palette.ink, font: { size: 11 } } },
      },
    },
  });
}

async function loadReport(): Promise<void> {
  const sequence = ++requestSequence;
  loading.value = true;
  report.value = null;
  destroyChart();
  try {
    const response = await fetch(`/api/c/${encodeURIComponent(props.slug)}/shap`, {
      headers: withAuthHeaders(),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const result = await response.json() as ShapReport;
    if (sequence !== requestSequence) return;
    report.value = result;
  } catch {
    if (sequence === requestSequence) report.value = { available: false, drivers: [] };
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

function goToAccount(targetSlug: string): void {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path: `/c/${targetSlug}?tab=shap` } }));
}

watch(() => props.slug, loadReport);
onMounted(loadReport);
onBeforeUnmount(destroyChart);
</script>

<template>
  <div class="shap-container">
    <div v-if="loading" class="state">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Chargement du profil ML…</span>
    </div>
    <div v-else-if="!report?.available" class="shap-empty-card">
      <div class="shap-unavail-badge">
        <span class="badge badge-region">MODÈLE EBM &amp; SHAP</span>
      </div>
      <h3 class="shap-unavail-title">Profil ML indisponible pour ce compte.</h3>
      <p class="shap-unavail-sub faint">
        L'analyse nécessite au moins 15 parties ADC dans les 20 dernières games pour que les indicateurs macro soient statistiquement robustes.
      </p>

      <div class="shap-demo-guidance">
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
    <div v-else class="shap-active-card">
      <div class="shap-header-row">
        <div>
          <div class="eyebrow-shap">EXPLICABILITÉ DU MODÈLE</div>
          <h2>Ce qui influence ton profil ML</h2>
        </div>
        <div class="spacer"></div>
        <button class="btn btn-sort-shap" @click="toggleSort">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true" style="margin-right:6px">
            <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
          </svg>
          {{ sort === "abs" ? "Trier par impact" : "Trier par valeur" }}
        </button>
      </div>

      <div class="shap-legend-strip">
        <div class="shap-legend-item">
          <span class="legend-box legend-box--gold" aria-hidden="true"></span>
          <span><strong>Contribution positive</strong> : facteurs forts poussant vers le haut niveau (GM/Challenger)</span>
        </div>
        <div class="shap-legend-item">
          <span class="legend-box legend-box--loss" aria-hidden="true"></span>
          <span><strong>Contribution négative</strong> : facteurs limitants / axes prioritaires d'amélioration</span>
        </div>
      </div>

      <p class="muted shap-explainer-text">
        Décomposition exacte du modèle Explainable Boosting Machine (EBM) : chaque barre mesure la contribution marginale (log-odds) de ton indicateur au placement de ton rang estimé par rapport au référentiel.
      </p>

      <div class="shap-wrap"><canvas ref="canvas"></canvas></div>
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
