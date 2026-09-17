<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { summonerIcon } from "./account-profile";
import { withAuthHeaders } from "./auth";
import HomePage from "./pages/HomePage.vue";
import AuthControl from "./components/AuthControl.ce.vue";
import AuthModal from "./components/AuthModal.ce.vue";
import RegisterForm from "./components/RegisterForm.ce.vue";

const AccountPage = defineAsyncComponent(() => import("./pages/AccountPage.vue"));
const ReadmePage = defineAsyncComponent(() => import("./pages/ReadmePage.vue"));

const route = useRoute();
const router = useRouter();
const accounts = ref<any[]>([]);
const accountsLoading = ref(true);
const switcherOpen = ref(false);
const switcher = ref<HTMLElement | null>(null);
const slug = computed(() => String(route.params.slug || ""));

function go(path: string): void { switcherOpen.value = false; void router.push(path); }
function scrollTop(): void { window.scrollTo({ top: 0, behavior: "smooth" }); }
function closeOutside(event: MouseEvent): void {
  if (switcherOpen.value && !switcher.value?.contains(event.target as Node)) switcherOpen.value = false;
}
function coachGo(event: Event): void {
  const path = (event as CustomEvent).detail?.path;
  if (path) go(path);
}

onMounted(async () => {
  document.addEventListener("click", closeOutside);
  window.addEventListener("coach-go", coachGo);
  try {
    const response = await fetch("/api/accounts", { headers: withAuthHeaders() });
    if (response.ok) accounts.value = await response.json();
  } finally { accountsLoading.value = false; }
});
onBeforeUnmount(() => {
  document.removeEventListener("click", closeOutside);
  window.removeEventListener("coach-go", coachGo);
});
</script>

<template>
  <nav class="topbar" aria-label="Navigation principale">
    <div class="topbar-inner">
      <div class="topbar-left">
        <a class="brand" href="/" aria-label="RiftSense - Accueil" @click.prevent="go('/')"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="var(--primary)" stroke-width="2" fill="rgba(14, 187, 212, 0.15)"/><polygon points="12,6 17,9.5 17,14.5 12,18 7,14.5 7,9.5" fill="var(--primary)"/></svg></span><span class="brand-text">RiftSense</span><span class="brand-badge">AI</span></a>
        <div class="topbar-nav" role="navigation">
          <a class="nav-link" :class="{ active: route.name === 'home' }" href="/" @click.prevent="go('/')"><svg class="nav-icon" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-4h2v4a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg><span>Accueil</span></a>
          <div ref="switcher" class="switcher">
            <button class="switcher-btn" :class="{ 'is-selected': route.name === 'account', open: switcherOpen }" type="button" :aria-expanded="switcherOpen" aria-label="Sélectionner ou changer de compte joueur" @click.stop="switcherOpen = !switcherOpen">
              <div v-if="route.name === 'account'" class="switcher-user-preview"><img class="switcher-avatar" :src="summonerIcon(slug)" alt="" loading="lazy"><div class="switcher-meta"><span class="switcher-label">Joueur actif</span><span class="switcher-name">{{ slug }}</span></div></div>
              <div v-else class="switcher-user-preview"><span class="switcher-icon-wrap" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg></span><div class="switcher-meta"><span class="switcher-label">Sélection</span><span class="switcher-name">Joueurs</span></div><span v-if="accounts.length" class="switcher-pill">{{ accounts.length }} compte{{ accounts.length > 1 ? "s" : "" }}</span></div>
              <svg class="switcher-arrow" :class="{ rotated: switcherOpen }" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
            <div v-if="switcherOpen" class="switcher-dropdown">
              <div class="switcher-header"><span class="switcher-title">Comptes suivis</span><span class="switcher-header-count">{{ accounts.length }} disponible{{ accounts.length > 1 ? "s" : "" }}</span></div>
              <div class="switcher-list"><a v-for="account in accounts" :key="account.slug" class="switcher-card" :class="{ active: route.name === 'account' && slug === account.slug }" :href="`/c/${account.slug}`" @click.prevent="go(`/c/${account.slug}`)"><div class="switcher-card-avatar"><img :src="summonerIcon(account.slug)" alt="" loading="lazy"><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-active-dot"></span></div><div class="switcher-card-content"><div class="switcher-card-header"><span class="switcher-card-slug">{{ account.slug }}</span><span class="badge badge-region-mini">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><div class="switcher-card-sub"><span class="switcher-card-riot">{{ account.riot_id }}</span><span class="switcher-card-sep">·</span><span class="switcher-card-games">{{ account.games_count }} parties</span></div></div><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-check" aria-label="Compte actif">✓</span></a></div>
              <div class="switcher-footer"><a class="switcher-home-btn" href="/" @click.prevent="go('/')"><span>Tous les comptes</span><span class="switcher-home-arrow">→</span></a></div>
            </div>
          </div>
          <a class="nav-link" :class="{ active: route.name === 'readme' }" href="/readme" @click.prevent="go('/readme')"><svg class="nav-icon" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg><span>À propos &amp; Méthode</span></a>
        </div>
      </div>
      <div class="topbar-right"><div class="topbar-status-badge" title="Région EUW · File Classée Solo/Duo synchronisée"><span class="status-pulse-dot"></span><span class="status-badge-text">EUW · SoloQ</span></div><AuthControl /></div>
    </div>
  </nav>

  <main class="container">
    <HomePage v-if="route.name === 'home'" :accounts="accounts" :loading="accountsLoading" />
    <RegisterForm v-else-if="route.name === 'register'" mode="status" />
    <AccountPage v-else-if="route.name === 'account'" :key="slug" :slug="slug" />
    <ReadmePage v-else-if="route.name === 'readme'" />
  </main>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-inner"><div class="footer-grid">
      <div class="footer-col footer-col-brand"><div class="footer-brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="var(--primary)" stroke-width="2" fill="rgba(14, 187, 212, 0.15)"/><polygon points="12,6 17,9.5 17,14.5 12,18 7,14.5 7,9.5" fill="var(--primary)"/></svg></span><span class="footer-brand-title">RiftSense</span><span class="brand-badge">AI</span></div><p class="footer-mission">Coaching personnalisé et analyse avancée des parties de League of Legends, alimentés par apprentissage automatique et modèles de langage.</p><div class="footer-disclaimer"><span>RiftSense n'est pas affilié à Riot Games et ne reflète pas les opinions de Riot Games.</span></div></div>
      <div class="footer-col"><h4 class="footer-heading">Navigation</h4><ul class="footer-nav-list"><li><a href="/" @click.prevent="go('/')"><span class="bullet">›</span> Accueil</a></li><li><a href="/readme" @click.prevent="go('/readme')"><span class="bullet">›</span> Méthodologie &amp; Données</a></li><li><a href="/" @click.prevent="go('/')"><span class="bullet">›</span> Vue d'ensemble des comptes</a></li></ul></div>
      <div class="footer-col"><h4 class="footer-heading">Comptes suivis</h4><ul class="footer-accounts-list"><li v-for="account in accounts" :key="account.slug"><a :href="`/c/${account.slug}`" class="footer-account-link" @click.prevent="go(`/c/${account.slug}`)"><img class="footer-account-avatar" :src="summonerIcon(account.slug)" alt="" loading="lazy"><div class="footer-account-info"><div class="row" style="gap:6px;align-items:center"><span class="footer-account-slug">{{ account.slug }}</span><span class="badge badge-region-xs">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><span class="footer-account-games">{{ account.games_count }} parties</span></div></a></li></ul></div>
      <div class="footer-col"><h4 class="footer-heading">Stack &amp; Architecture</h4><ul class="footer-tech-list"><li><span class="tech-pill">Cloudflare Workers</span><span class="tech-desc">Serving edge &amp; API KV</span></li><li><span class="tech-pill">LightGBM &amp; SHAP</span><span class="tech-desc">Modèle prédictif du rang</span></li><li><span class="tech-pill">Ollama LLM</span><span class="tech-desc">Génération des revues de match</span></li><li><span class="tech-pill">Riot Games API</span><span class="tech-desc">Collecte de parties et métriques</span></li></ul></div>
    </div><div class="footer-bottom"><div class="footer-copyright"><span>© 2026 RiftSense</span><span class="footer-sep">·</span><span>Données actualisées pour la Saison 2026</span><span class="footer-sep">·</span><span>Conçu pour progresser sur la Faille de l'Invocateur</span></div><button class="footer-scroll-top" type="button" aria-label="Remonter en haut de page" @click="scrollTop"><span>Haut de page</span><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg></button></div></div>
  </footer>
  <AuthModal />
</template>
