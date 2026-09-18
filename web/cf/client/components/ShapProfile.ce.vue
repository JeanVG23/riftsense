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
        backgroundColor: drivers.map((driver) => driver.contribution >= 0 ? "#c8aa6e" : "#f85149"),
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
        x: { grid: { color: "#2a2d34" }, ticks: { color: "#9a9da4", font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { color: "#e8e9ec", font: { size: 11 } } },
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
          <span><strong>Barres dorées</strong> : Facteurs forts poussant vers le haut niveau (High-Elo GM/C)</span>
        </div>
        <div class="shap-legend-item">
          <span class="legend-box legend-box--loss" aria-hidden="true"></span>
          <span><strong>Barres rouges</strong> : Facteurs limitants / axes prioritaires d'amélioration (M/D)</span>
        </div>
      </div>

      <p class="muted shap-explainer-text">
        Décomposition exacte du modèle Explainable Boosting Machine (EBM) : chaque barre mesure la contribution marginale (log-odds) de ton indicateur au placement de ton rang estimé par rapport au référentiel.
      </p>

      <div class="shap-wrap"><canvas ref="canvas"></canvas></div>
    </div>
  </div>
</template>
