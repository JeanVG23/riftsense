<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  notifyAuthChange,
  setStoredAuthToken,
  type CoachOpenAuthDetail,
  type PostAuthAction,
} from "../auth";

interface LoginResponse {
  ok?: boolean;
  token?: string;
  detail?: string;
}

const open = ref(false);
const password = ref("");
const error = ref<string | null>(null);
const loading = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);
let postAuthAction: PostAuthAction | null = null;

function show(event: Event): void {
  const detail = (event as CustomEvent<CoachOpenAuthDetail>).detail;
  postAuthAction = typeof detail?.action === "function" ? detail.action : null;
  password.value = "";
  error.value = null;
  open.value = true;
  void nextTick(() => passwordInput.value?.focus());
}

function close(): void {
  open.value = false;
  password.value = "";
  error.value = null;
  postAuthAction = null;
}

function onKeydown(event: KeyboardEvent): void {
  if (open.value && event.key === "Escape") close();
}

async function login(): Promise<void> {
  const trimmedPassword = password.value.trim();
  if (!trimmedPassword) {
    error.value = "Veuillez saisir le mot de passe coach.";
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmedPassword }),
    });
    const data = await response.json().catch(() => ({})) as LoginResponse;
    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.detail || "Mot de passe incorrect.");
    }

    setStoredAuthToken(data.token);
    notifyAuthChange(true);
    const pendingAction = postAuthAction;
    close();
    if (pendingAction) window.setTimeout(pendingAction, 100);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Erreur de connexion.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  window.addEventListener("coach-open-auth", show);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("coach-open-auth", show);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div v-if="open" class="auth-modal-backdrop" @click.self="close">
    <div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div class="auth-modal-header">
        <div class="auth-modal-header-left">
          <div class="auth-modal-icon-wrap">
            <span class="auth-modal-icon">🔐</span>
          </div>
          <div>
            <h3 id="auth-modal-title" class="auth-modal-title">Accès Coach IA</h3>
            <p class="auth-modal-sub">Mot de passe requis pour générer de nouvelles analyses et utiliser le LLM.</p>
          </div>
        </div>
        <button type="button" class="auth-modal-close" aria-label="Fermer la fenêtre" @click="close">✕</button>
      </div>

      <form class="auth-modal-form" @submit.prevent="login">
        <div class="auth-field-group">
          <label for="coach-auth-password-input" class="auth-label">Mot de passe coach</label>
          <div class="auth-input-wrapper">
            <input
              id="coach-auth-password-input"
              ref="passwordInput"
              v-model="password"
              type="password"
              class="auth-input"
              placeholder="Saisis le mot de passe…"
              autocomplete="current-password"
              required
            >
          </div>
        </div>

        <div v-if="error" class="auth-error-banner" role="alert">
          <span class="auth-error-icon">⚠️</span>
          <span>{{ error }}</span>
        </div>

        <div class="auth-modal-actions">
          <button type="button" class="btn btn-secondary auth-cancel-btn" @click="close">Annuler</button>
          <button type="submit" class="btn btn-primary auth-submit-btn" :disabled="loading || !password.trim()">
            <span>{{ loading ? "Vérification…" : "Déverrouiller" }}</span>
            <span v-if="!loading" aria-hidden="true">🔓</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
