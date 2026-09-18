<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { RECENT_ACCOUNTS_CHANGED, rememberRecentAccount } from "../recent-accounts";

const REGISTER_ERRORS: Record<string, string> = {
  riot_id_not_found: "Ce Riot ID est introuvable. Vérifie le pseudo et le tag.",
  no_ranked_games: "Aucune partie classée récente trouvée sur ce compte.",
  riot_unavailable: "L'API Riot ne répond pas pour le moment. Réessaie dans quelques minutes.",
  internal: "Une erreur interne est survenue. Réessaie plus tard.",
};

interface RegistrationResponse {
  slug?: string;
  detail?: string;
  state?: string;
  error_code?: string;
  position?: number | null;
  n_games?: number | null;
}

const riotId = ref("");
const platform = ref("euw1");
const submitting = ref(false);
const error = ref<string | null>(null);
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function setError(msg: string): void {
  error.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    error.value = null;
  }, 6000);
}

function clearError(): void {
  if (errorTimer) clearTimeout(errorTimer);
  error.value = null;
}

function navigate(path: string): void {
  window.dispatchEvent(new CustomEvent("coach-go", { detail: { path } }));
}

async function submit(): Promise<void> {
  const trimmed = riotId.value.trim();
  if (!trimmed || submitting.value) return;

  if (!trimmed.includes("#")) {
    setError("Format attendu : Invocateur#TAG");
    return;
  }

  clearError();
  submitting.value = true;
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riot_id: trimmed, platform: platform.value }),
    });
    const body = (await response.json().catch(() => ({}))) as RegistrationResponse;
    if (!response.ok || !body.slug) {
      setError(body.detail || REGISTER_ERRORS.internal);
      return;
    }
    rememberRecentAccount({
      slug: body.slug,
      riot_id: trimmed,
      region: platform.value,
      games_count: body.n_games ?? undefined,
    });
    window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
    riotId.value = "";
    navigate(`/register/${body.slug}`);
  } catch {
    setError(REGISTER_ERRORS.internal);
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(() => {
  if (errorTimer) clearTimeout(errorTimer);
});
</script>

<template>
  <div class="nav-search-container">
    <form class="nav-search-form" @submit.prevent="submit" role="search" aria-label="Recherche et analyse de joueur">
      <div class="nav-search-fields">
        <!-- Champ Riot ID -->
        <label class="nav-search-group nav-group-riot" for="nav-riot-id">
          <div class="nav-search-input-wrap">
            <span v-if="submitting" class="loading-spinner-inline nav-search-spinner" aria-hidden="true"></span>
            <svg v-else class="nav-search-icon" viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
            </svg>
            <input
              id="nav-riot-id"
              v-model="riotId"
              class="nav-search-input"
              type="text"
              placeholder="Invocateur#TAG"
              aria-label="Riot ID au format Invocateur#TAG"
              autocomplete="off"
              spellcheck="false"
              required
              @input="error ? clearError() : null"
            >
            <span v-if="riotId.trim() && !submitting" class="nav-search-enter-hint" title="Appuie sur Entrée pour analyser">↵</span>
          </div>
        </label>

        <span class="nav-search-sep" aria-hidden="true"></span>

        <!-- Sélecteur de Serveur -->
        <label class="nav-search-group nav-group-server" for="nav-platform">
          <div class="nav-search-select-wrap">
            <select
              id="nav-platform"
              v-model="platform"
              class="nav-search-select"
              aria-label="Serveur de jeu"
            >
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
          </div>
        </label>

        <!-- Bouton submit accessible pour validation au clavier Entrée -->
        <button
          type="submit"
          class="sr-only-submit"
          :disabled="submitting || !riotId.trim()"
          aria-hidden="true"
          tabindex="-1"
        ></button>
      </div>
    </form>

    <!-- Bulle d'erreur contextuelle -->
    <div v-if="error" class="nav-search-error-toast" role="alert">
      <span class="nav-search-error-icon" aria-hidden="true">⚠️</span>
      <span class="nav-search-error-msg">{{ error }}</span>
      <button type="button" class="nav-search-error-close" aria-label="Fermer l'erreur" @click="clearError">×</button>
    </div>
  </div>
</template>
