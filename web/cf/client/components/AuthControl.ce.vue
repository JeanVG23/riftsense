<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  authToken,
  notifyAuthChange,
  openCoachAuth,
  setStoredAuthToken,
  withAuthHeaders,
  type CoachAuthChangeDetail,
} from "../auth";

interface AuthStatusResponse {
  authenticated?: boolean;
}

const authenticated = ref(Boolean(authToken));

function onAuthChange(event: Event): void {
  authenticated.value = Boolean(
    (event as CustomEvent<CoachAuthChangeDetail>).detail?.authenticated,
  );
}

async function checkStatus(): Promise<void> {
  try {
    const response = await fetch("/api/auth/status", { headers: withAuthHeaders() });
    if (!response.ok) return;
    const status = await response.json() as AuthStatusResponse;
    authenticated.value = Boolean(status.authenticated);
    if (!authenticated.value && authToken) setStoredAuthToken(null);
    notifyAuthChange(authenticated.value);
  } catch {
    // Une indisponibilité réseau ne doit pas déconnecter une session locale valide.
  }
}

async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Le jeton local est supprimé même si le endpoint est indisponible.
  }
  setStoredAuthToken(null);
  authenticated.value = false;
  notifyAuthChange(false);
}

onMounted(() => {
  window.addEventListener("coach-auth-change", onAuthChange);
  void checkStatus();
});

onBeforeUnmount(() => {
  window.removeEventListener("coach-auth-change", onAuthChange);
});
</script>

<template>
  <button
    v-if="!authenticated"
    type="button"
    class="topbar-auth-btn"
    title="Connexion pour débloquer les fonctionnalités LLM"
    @click="openCoachAuth()"
  >
    <span class="auth-lock-icon">🔒</span>
    <span>Connexion coach</span>
  </button>
  <div v-else class="topbar-auth-logged">
    <span class="topbar-auth-pill" title="Mode Coach déverrouillé">
      <span class="auth-unlock-icon">🔓</span>
      <span>Coach actif</span>
    </span>
    <button type="button" class="topbar-logout-btn" title="Se déconnecter" @click="logout">
      <span>Déconnexion</span>
    </button>
  </div>
</template>
