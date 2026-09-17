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

watch(() => props.slug, loadReport);
onMounted(loadReport);
onBeforeUnmount(destroyChart);
</script>

<template>
  <div>
    <div v-if="loading" class="state">Chargement du profil ML…</div>
    <div v-else-if="!report?.available" class="shap-empty state">
      Profil ML indisponible pour ce compte.<br>
      <span class="faint">L'analyse nécessite au moins 15 parties ADC dans les 20 dernières games.</span>
    </div>
    <div v-else>
      <div class="row" style="margin-bottom:12px">
        <h2>Ce qui influence ton profil ML</h2>
        <div class="spacer"></div>
        <button class="btn" @click="toggleSort">{{ sort === "abs" ? "Trier par impact" : "Trier par valeur" }}</button>
      </div>
      <p class="muted" style="font-size:13px;margin:0 0 14px">
        Décomposition exacte du modèle EBM : contribution (log-odds) de chaque
        indicateur au placement de ton rang estimé.
        <span style="color:var(--gold)">or</span> = pousse vers High-Elo (GM/C),
        <span style="color:var(--loss)">rouge</span> = pousse vers Low-Elo (M/D).
        Lecture <strong>descriptive</strong> : ce graphe dit ce que le modèle a retenu de
        tes parties, pas ce qu'il faut faire. En particulier la profondeur de carte
        (<code>map_depth</code>) est un marqueur de risque : une barre or ne signifie
        pas « enfonce-toi davantage ».
      </p>
      <div class="shap-wrap"><canvas ref="canvas"></canvas></div>
    </div>
  </div>
</template>
