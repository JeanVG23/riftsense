<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

type RegistrationState = "queued" | "running" | "done" | "error";

interface RegistrationResponse {
  slug?: string;
  detail?: string;
  state?: RegistrationState;
  error_code?: string;
  position?: number | null;
  n_games?: number | null;
}

const props = withDefaults(defineProps<{ mode?: "form" | "status" }>(), {
  mode: "form",
});

const REGISTER_ERRORS: Record<string, string> = {
  riot_id_not_found: "Ce Riot ID est introuvable. Vérifie le pseudo et le tag.",
  no_ranked_games: "Aucune partie classée récente trouvée sur ce compte.",
  riot_unavailable: "L'API Riot ne répond pas pour le moment. Réessaie dans quelques minutes.",
  internal: "Une erreur interne est survenue. Réessaie plus tard.",
};
const MAX_NETWORK_RETRIES = 5;

const riotId = ref("");
const platform = ref("euw1");
const state = ref<RegistrationState | null>(null);
const position = ref<number | null>(null);
const error = ref<string | null>(null);
const submitting = ref(false);
const slug = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let networkFailures = 0;
let stopped = false;

function navigate(path: string) {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path } }));
}

function stopPolling() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  stopped = true;
}

function poll() {
  if (stopped) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(refresh, 3000);
}

async function submit() {
  error.value = null;
  submitting.value = true;
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riot_id: riotId.value, platform: platform.value }),
    });
    const body = await response.json().catch(() => ({})) as RegistrationResponse;
    if (!response.ok || !body.slug) {
      error.value = body.detail || REGISTER_ERRORS.internal;
      return;
    }
    navigate(`/register/${body.slug}`);
  } catch {
    error.value = REGISTER_ERRORS.internal;
  } finally {
    submitting.value = false;
  }
}

async function refresh() {
  if (!slug.value || stopped) return;
  let response: Response;
  try {
    response = await fetch(`/api/register/${encodeURIComponent(slug.value)}/status`);
  } catch {
    networkFailures += 1;
    if (networkFailures >= MAX_NETWORK_RETRIES) {
      state.value = "error";
      error.value = REGISTER_ERRORS.internal;
      return;
    }
    poll();
    return;
  }

  networkFailures = 0;
  const body = await response.json().catch(() => ({})) as RegistrationResponse;
  if (!response.ok) {
    state.value = "error";
    error.value = body.detail || REGISTER_ERRORS.internal;
    return;
  }
  if (body.state === "error") {
    state.value = "error";
    error.value = REGISTER_ERRORS[body.error_code || ""] || REGISTER_ERRORS.internal;
    return;
  }
  if (body.state === "done") {
    state.value = "done";
    navigate(`/c/${slug.value}`);
    return;
  }
  if (body.state !== "queued" && body.state !== "running") {
    state.value = "error";
    error.value = REGISTER_ERRORS.internal;
    return;
  }
  state.value = body.state;
  position.value = body.position ?? null;
  poll();
}

function backToForm() {
  stopPolling();
  navigate("/");
}

onMounted(() => {
  if (props.mode !== "status") return;
  const match = location.pathname.match(/^\/register\/([^/]+)$/);
  if (!match) {
    state.value = "error";
    error.value = REGISTER_ERRORS.internal;
    return;
  }
  slug.value = decodeURIComponent(match[1]);
  state.value = "queued";
  void refresh();
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <section v-if="mode === 'form'" class="card">
    <h2>Analyser mon compte</h2>
    <p class="muted">
      Saisis ton Riot ID : on récupère tes vingt dernières parties classées et on
      t'ouvre ton tableau de bord (le détail de chaque partie, ton rang et ton profil
      de jeu). Les analyses écrites par le modèle restent réservées. Ton compte
      n'apparaît pas dans la liste ci-dessus : le lien de ta page ne sera connu que
      de toi.
    </p>
    <form class="row wrap" @submit.prevent="submit">
      <label class="field-label" for="riot-id">Riot ID
        <input id="riot-id" v-model="riotId" class="input" placeholder="Pseudo#TAG" required>
      </label>
      <label class="field-label" for="platform">Serveur
        <select id="platform" v-model="platform" class="select">
          <option value="euw1">EUW</option>
          <option value="eun1">EUNE</option>
          <option value="na1">NA</option>
          <option value="kr">KR</option>
          <option value="br1">BR</option>
          <option value="jp1">JP</option>
          <option value="tr1">TR</option>
          <option value="la1">LAN</option>
          <option value="la2">LAS</option>
          <option value="oc1">OCE</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary" :disabled="submitting || !riotId">
        {{ submitting ? "Envoi…" : "Analyser" }}
      </button>
    </form>
    <p v-if="error" class="state err">{{ error }}</p>
  </section>

  <div v-else class="page-intro home-intro">
    <p class="eyebrow">INSCRIPTION</p>
    <h1>{{ state === "error" ? "Analyse impossible" : "Analyse de ton compte en cours" }}</h1>
    <div class="card">
      <p v-if="state === 'queued'" class="muted">
        En file d'attente<span v-if="position"> (position {{ position }})</span>.
        La collecte démarre dès que le créneau se libère.
      </p>
      <p v-if="state === 'running'" class="muted">
        Collecte en cours auprès de l'API Riot. Cela prend jusqu'à une minute.
      </p>
      <p v-if="error" class="state err">{{ error }}</p>
      <p v-if="state === 'error'" class="row">
        <a class="btn" href="/" @click.prevent="backToForm">Revenir au formulaire</a>
      </p>
    </div>
  </div>
</template>
