<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { formatPseudo, isOwnerAccount, summonerIcon } from "./account-profile";
import { withAuthHeaders } from "./auth";
import {
  RECENT_ACCOUNTS_CHANGED,
  readRecentAccounts,
  removeRecentAccount,
  type RecentAccount,
} from "./recent-accounts";
import HomePage from "./pages/HomePage.vue";
import AuthControl from "./components/AuthControl.ce.vue";
import AuthModal from "./components/AuthModal.ce.vue";
import NavSearch from "./components/NavSearch.vue";
import RegisterForm from "./components/RegisterForm.ce.vue";

const AccountPage = defineAsyncComponent(() => import("./pages/AccountPage.vue"));
const ReadmePage = defineAsyncComponent(() => import("./pages/ReadmePage.vue"));
const TermsPage = defineAsyncComponent(() => import("./pages/TermsPage.vue"));
const PrivacyPage = defineAsyncComponent(() => import("./pages/PrivacyPage.vue"));

const route = useRoute();
const router = useRouter();
const accounts = ref<any[]>([]);
const recentAccounts = ref<RecentAccount[]>(readRecentAccounts());
const accountsLoading = ref(true);
const switcherOpen = ref(false);
const switcher = ref<HTMLElement | null>(null);
const mobileMenuOpen = ref(false);
const mobileMenu = ref<HTMLElement | null>(null);
const mobileMenuBtn = ref<HTMLElement | null>(null);
const slug = computed(() => String(route.params.slug || ""));
const privateRecentAccounts = computed(() => {
  const publicSlugs = new Set(accounts.value.map(account => account.slug));
  return recentAccounts.value.filter(account => !publicSlugs.has(account.slug));
});
const ownerAccounts = computed(() => accounts.value.filter(isOwnerAccount));
const permanentAccounts = computed(() => accounts.value.filter(a => !isOwnerAccount(a)));
const switcherAccountsCount = computed(() => accounts.value.length + privateRecentAccounts.value.length);
const activeAccountRecord = ref<RecentAccount | null>(null);
const currentAccount = computed(() => {
  if (!slug.value) return null;
  const s = slug.value.toLowerCase();
  if (activeAccountRecord.value && (activeAccountRecord.value.slug || "").toLowerCase() === s) {
    return activeAccountRecord.value;
  }
  return (
    accounts.value.find(a => (a.slug || "").toLowerCase() === s) ||
    recentAccounts.value.find(a => (a.slug || "").toLowerCase() === s) ||
    null
  );
});

function scrollToTop(smooth = false): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: smooth ? "smooth" : "instant" });
  }
}

function go(path: string): void {
  switcherOpen.value = false;
  mobileMenuOpen.value = false;
  if (route.path === path || route.fullPath === path) {
    scrollToTop(true);
    return;
  }
  scrollToTop(false);
  void router.push(path);
}
function scrollTop(): void { scrollToTop(true); }
function closeOutside(event: MouseEvent): void {
  const target = event.target as Node;
  if (switcherOpen.value && !switcher.value?.contains(target)) switcherOpen.value = false;
  if (mobileMenuOpen.value && !mobileMenu.value?.contains(target) && !mobileMenuBtn.value?.contains(target)) {
    mobileMenuOpen.value = false;
  }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (switcherOpen.value) switcherOpen.value = false;
    if (mobileMenuOpen.value) mobileMenuOpen.value = false;
  }
}
function coachGo(event: Event): void {
  const path = (event as CustomEvent).detail?.path;
  if (path) go(path);
}
function refreshRecentAccounts(): void {
  recentAccounts.value = readRecentAccounts();
  const s = slug.value.toLowerCase();
  const found = recentAccounts.value.find(a => (a.slug || "").toLowerCase() === s);
  if (found && typeof found.icon === "number") {
    activeAccountRecord.value = found;
  }
}

watch(
  () => [route.name, slug.value],
  async ([name, newSlug]) => {
    if (name !== "account" || !newSlug) {
      activeAccountRecord.value = null;
      return;
    }
    const s = String(newSlug).toLowerCase();
    const existing =
      accounts.value.find(a => (a.slug || "").toLowerCase() === s) ||
      recentAccounts.value.find(a => (a.slug || "").toLowerCase() === s);
    if (existing && typeof existing.icon === "number") {
      activeAccountRecord.value = existing;
      return;
    }
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(String(newSlug))}/account`, {
        headers: withAuthHeaders(),
      });
      if (response.ok) {
        activeAccountRecord.value = await response.json();
      }
    } catch {
      // Repli gracieux sur le slug
    }
  },
  { immediate: true }
);

watch(
  () => route.path,
  (newPath, oldPath) => {
    mobileMenuOpen.value = false;
    if (newPath !== oldPath) {
      scrollToTop(false);
      void nextTick(() => {
        scrollToTop(false);
      });
    }
  }
);
function forgetRecentAccount(accountSlug: string): void {
  recentAccounts.value = removeRecentAccount(accountSlug);
}

onMounted(async () => {
  document.addEventListener("click", closeOutside);
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("coach-go", coachGo);
  window.addEventListener(RECENT_ACCOUNTS_CHANGED, refreshRecentAccounts);
  try {
    const response = await fetch("/api/accounts", { headers: withAuthHeaders() });
    if (response.ok) accounts.value = await response.json();
  } finally { accountsLoading.value = false; }
});
onBeforeUnmount(() => {
  document.removeEventListener("click", closeOutside);
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("coach-go", coachGo);
  window.removeEventListener(RECENT_ACCOUNTS_CHANGED, refreshRecentAccounts);
});
</script>

<template>
  <nav class="topbar" aria-label="Main navigation">
    <div class="topbar-inner">
      <div class="topbar-left">
        <a class="brand" href="/" aria-label="RiftSense - Home" @click.prevent="go('/')"><span class="brand-mark" aria-hidden="true"><img class="brand-svg" src="/logo.svg" alt="RiftSense Logo" width="28" height="28"></span><span class="brand-text">RiftSense</span><span class="brand-badge">LoL Esports Analytics</span></a>
      </div>
      <div class="topbar-center">
        <NavSearch />
      </div>
      <div class="topbar-right topbar-nav" role="navigation">
        <div ref="switcher" class="switcher">
          <button class="switcher-btn" :class="{ 'is-selected': route.name === 'account', open: switcherOpen }" type="button" :aria-expanded="switcherOpen" aria-label="Select or switch player account" @click.stop="switcherOpen = !switcherOpen">
            <div v-if="route.name === 'account'" class="switcher-user-preview"><img class="switcher-avatar" :src="summonerIcon(currentAccount || slug)" alt="" loading="lazy"><div class="switcher-meta"><span class="switcher-label">Active player</span><span class="switcher-name">{{ formatPseudo(currentAccount || slug) }}</span></div></div>
            <div v-else class="switcher-user-preview"><span class="switcher-icon-wrap" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg></span><div class="switcher-meta"><span class="switcher-label">Select</span><span class="switcher-name">Players</span></div></div>
            <svg class="switcher-arrow" :class="{ rotated: switcherOpen }" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
          <div v-if="switcherOpen" class="switcher-dropdown">
            <div class="switcher-header"><span class="switcher-title">Players</span><span class="switcher-header-count">{{ switcherAccountsCount }} available</span></div>
            <div class="switcher-lists">
              <div v-if="privateRecentAccounts.length" class="switcher-section">
                <div class="switcher-section-title">My recent accounts</div>
                <div class="switcher-list">
                  <div v-for="account in privateRecentAccounts" :key="account.slug" class="switcher-card-row">
                    <a class="switcher-card" :class="{ active: route.name === 'account' && slug === account.slug }" :href="`/c/${account.slug}`" @click.prevent="go(`/c/${account.slug}`)"><div class="switcher-card-avatar"><img :src="summonerIcon(account)" alt="" loading="lazy"><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-active-dot"></span></div><div class="switcher-card-content"><div class="switcher-card-header"><span class="switcher-card-slug">{{ formatPseudo(account) }}</span><span class="badge badge-region-mini">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><div class="switcher-card-sub"><span class="switcher-card-riot">{{ account.riot_id }}</span></div></div><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-check" aria-label="Active account">✓</span></a>
                    <button class="switcher-remove" type="button" :aria-label="`Remove ${account.riot_id} from recent accounts`" title="Remove from my recent accounts" @click.stop="forgetRecentAccount(account.slug)">×</button>
                  </div>
                </div>
              </div>
              <div v-if="ownerAccounts.length" class="switcher-section">
                <div class="switcher-section-title">My accounts</div>
                <div class="switcher-list">
                  <a v-for="account in ownerAccounts" :key="account.slug" class="switcher-card" :class="{ active: route.name === 'account' && slug === account.slug }" :href="`/c/${account.slug}`" @click.prevent="go(`/c/${account.slug}`)"><div class="switcher-card-avatar"><img :src="summonerIcon(account)" alt="" loading="lazy"><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-active-dot"></span></div><div class="switcher-card-content"><div class="switcher-card-header"><span class="switcher-card-slug">{{ formatPseudo(account) }}</span><span class="badge badge-owner-tag-mini">Personal</span><span class="badge badge-region-mini">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><div class="switcher-card-sub"><span class="switcher-card-riot">{{ account.riot_id }}</span><span class="switcher-card-sep">·</span><span class="switcher-card-games">{{ account.games_count }} games</span></div></div><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-check" aria-label="Active account">✓</span></a>
                </div>
              </div>
              <div v-if="permanentAccounts.length" class="switcher-section">
                <div class="switcher-section-title">Featured accounts</div>
                <div class="switcher-list"><a v-for="account in permanentAccounts" :key="account.slug" class="switcher-card" :class="{ active: route.name === 'account' && slug === account.slug }" :href="`/c/${account.slug}`" @click.prevent="go(`/c/${account.slug}`)"><div class="switcher-card-avatar"><img :src="summonerIcon(account)" alt="" loading="lazy"><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-active-dot"></span></div><div class="switcher-card-content"><div class="switcher-card-header"><span class="switcher-card-slug">{{ formatPseudo(account) }}</span><span class="badge badge-region-mini">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><div class="switcher-card-sub"><span class="switcher-card-riot">{{ account.riot_id }}</span><span class="switcher-card-sep">·</span><span class="switcher-card-games">{{ account.games_count }} games</span></div></div><span v-if="route.name === 'account' && slug === account.slug" class="switcher-card-check" aria-label="Active account">✓</span></a></div>
              </div>
              <div v-if="!switcherAccountsCount" class="switcher-empty">No saved accounts.</div>
            </div>
            <div class="switcher-footer"><a class="switcher-home-btn" href="/" @click.prevent="go('/')"><span>All accounts</span><span class="switcher-home-arrow">→</span></a></div>
          </div>
        </div>
        <div class="desktop-nav-links">
          <a class="nav-link" :class="{ active: route.name === 'account' && slug === 'spadzze' }" href="/c/spadzze?review=EUW1_7898084645" @click.prevent="go('/c/spadzze?review=EUW1_7898084645')"><svg class="nav-icon" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg><span>Interactive demo</span></a>
          <a class="nav-link" :class="{ active: route.name === 'readme' }" href="/readme" @click.prevent="go('/readme')"><svg class="nav-icon" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg><span>Methodology</span></a>
        </div>

        <button
          ref="mobileMenuBtn"
          class="mobile-menu-btn"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-label="Main menu"
          @click.stop="mobileMenuOpen = !mobileMenuOpen"
        >
          <span class="hamburger-box" aria-hidden="true">
            <span class="hamburger-inner" :class="{ 'is-active': mobileMenuOpen }"></span>
          </span>
        </button>
      </div>
    </div>

    <!-- Menu mobile déroulant -->
    <div
      v-if="mobileMenuOpen"
      ref="mobileMenu"
      class="mobile-drawer"
      role="dialog"
      aria-label="Mobile navigation menu"
    >
      <div class="mobile-drawer-inner">
        <div class="mobile-drawer-section">
          <div class="mobile-drawer-title">Main navigation</div>
          <div class="mobile-drawer-links">
            <a
              class="mobile-nav-card"
              :class="{ active: route.name === 'home' }"
              href="/"
              @click.prevent="go('/')"
            >
              <div class="mobile-nav-icon-wrap">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                </svg>
              </div>
              <div class="mobile-nav-info">
                <span class="mobile-nav-heading">Home</span>
                <span class="mobile-nav-desc">Dashboard &amp; account analysis</span>
              </div>
            </a>

            <a
              class="mobile-nav-card"
              :class="{ active: route.name === 'account' && slug === 'spadzze' }"
              href="/c/spadzze?review=EUW1_7898084645"
              @click.prevent="go('/c/spadzze?review=EUW1_7898084645')"
            >
              <div class="mobile-nav-icon-wrap gold-glow">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                </svg>
              </div>
              <div class="mobile-nav-info">
                <div class="mobile-nav-head-row">
                  <span class="mobile-nav-heading">Interactive demo</span>
                  <span class="badge badge-gold-glow">Spadzze</span>
                </div>
                <span class="mobile-nav-desc">Full analysis and AI tactical review</span>
              </div>
            </a>

            <a
              class="mobile-nav-card"
              :class="{ active: route.name === 'readme' }"
              href="/readme"
              @click.prevent="go('/readme')"
            >
              <div class="mobile-nav-icon-wrap">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                </svg>
              </div>
              <div class="mobile-nav-info">
                <span class="mobile-nav-heading">Methodology</span>
                <span class="mobile-nav-desc">Architecture, ML models &amp; Riot pipeline</span>
              </div>
            </a>
          </div>
        </div>

        <div class="mobile-drawer-footer">
          <div class="mobile-legal-links">
            <a href="/terms" class="mobile-legal-link" @click.prevent="go('/terms')">Terms</a>
            <span class="footer-sep">·</span>
            <a href="/privacy" class="mobile-legal-link" @click.prevent="go('/privacy')">Privacy</a>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <div class="app-main-wrapper">
    <main class="container">
      <HomePage v-if="route.name === 'home'" :accounts="accounts" :recent-accounts="recentAccounts" :loading="accountsLoading" />
      <RegisterForm v-else-if="route.name === 'register'" mode="status" />
      <AccountPage v-else-if="route.name === 'account'" :key="slug" :slug="slug" />
      <ReadmePage v-else-if="route.name === 'readme'" />
      <TermsPage v-else-if="route.name === 'terms'" />
      <PrivacyPage v-else-if="route.name === 'privacy'" />
    </main>
  </div>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-inner"><div class="footer-grid">
      <div class="footer-col footer-col-brand"><div class="footer-brand"><span class="brand-mark" aria-hidden="true"><img class="brand-svg" src="/logo.svg" alt="RiftSense Logo" width="26" height="26"></span><span class="footer-brand-title">RiftSense</span><span class="brand-badge">LoL Esports Analytics</span></div><p class="footer-mission">League of Legends performance analytics and tactical coaching powered by machine learning and statistical explainability.</p><div class="footer-disclaimer"><span>RiftSense isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</span></div></div>
      <div class="footer-col"><h4 class="footer-heading">My accounts</h4><ul class="footer-accounts-list"><li v-for="account in ownerAccounts" :key="account.slug"><a :href="`/c/${account.slug}`" class="footer-account-link" @click.prevent="go(`/c/${account.slug}`)"><img class="footer-account-avatar" :src="summonerIcon(account)" alt="" loading="lazy"><div class="footer-account-info"><div class="row footer-account-title-row"><span class="footer-account-slug">{{ formatPseudo(account) }}</span><span class="badge badge-region-xs">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><span class="footer-account-games">{{ account.games_count }} games</span></div></a></li></ul></div>
      <div class="footer-col"><h4 class="footer-heading">Stack &amp; Architecture</h4><ul class="footer-tech-list"><li><span class="tech-pill">Cloudflare Workers</span><span class="tech-desc">Edge serving &amp; KV API</span></li><li><span class="tech-pill">EBM &amp; SHAP</span><span class="tech-desc">Rank prediction model</span></li><li><span class="tech-pill">Ollama LLM</span><span class="tech-desc">Game review generation</span></li><li><span class="tech-pill">Riot Games API</span><span class="tech-desc">Game and metric collection</span></li></ul></div>
    </div><div class="footer-bottom"><div class="footer-copyright"><span>© 2026 RiftSense</span><span class="footer-sep">·</span><a href="/c/spadzze?review=EUW1_7898084645" class="footer-link-subtle" @click.prevent="go('/c/spadzze?review=EUW1_7898084645')">Spadzze demo</a><span class="footer-sep">·</span><a href="/readme" class="footer-link-subtle" @click.prevent="go('/readme')">Methodology</a><span class="footer-sep">·</span><a href="/terms" class="footer-link-subtle" @click.prevent="go('/terms')">Terms</a><span class="footer-sep">·</span><a href="/privacy" class="footer-link-subtle" @click.prevent="go('/privacy')">Privacy</a></div><div class="footer-bottom-actions"><AuthControl /><button class="footer-scroll-top" type="button" aria-label="Back to top" @click="scrollTop"><span>Back to top</span><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg></button></div></div></div>
  </footer>
  <AuthModal />
</template>

<style scoped>
/* Targon Éditorial — shell */
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-topbar-glass);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(255, 253, 248, .65), 0 12px 32px -30px rgba(20, 23, 24, .28);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.topbar-inner {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0 24px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.topbar-left { display: flex; align-items: center; flex-shrink: 0; }

.topbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  max-width: 560px;
  min-width: 180px;
  margin: 0 auto;
}

.topbar .brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--ink);
  font-size: 17.5px;
  font-weight: 800;
  letter-spacing: -0.018em;
  text-decoration: none;
  flex-shrink: 0;
}
.topbar .brand:hover { color: var(--ink); text-decoration: none; }

.brand-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--gold-deep);
  background: var(--surface);
  border: 1.5px solid rgba(195, 160, 110, 0.48);
  border-radius: 11px;
  box-shadow:
    0 2px 6px rgba(20, 23, 24, .08),
    inset 0 1px 0 var(--surface-inset-highlight);
  flex-shrink: 0;
  transition: var(--transition-fast);
}
.brand:hover .brand-mark {
  border-color: var(--targon-veil-accent);
  box-shadow:
    0 3px 12px rgba(185, 143, 83, 0.3),
    0 0 12px rgba(255, 215, 80, 0.3);
  transform: translateY(-0.5px);
}
.brand-mark .brand-svg { display: block; }

.brand-text {
  font-size: 17.5px;
  font-weight: 800;
  letter-spacing: -0.018em;
  color: var(--ink);
}

.brand-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .065em;
  padding: 3px 9px;
  background-color: var(--targon-veil-surface);
  background: var(--targon-veil-button);
  color: var(--targon-veil-text);
  border: 1px solid rgba(215, 175, 110, 0.55);
  border-radius: 5px;
  text-transform: uppercase;
  box-shadow:
    0 2px 6px var(--targon-veil-overlay),
    inset 0 1px 0 rgba(255, 200, 210, 0.35),
    inset 0 -1px 2px rgba(0, 0, 0, 0.4);
}

.topbar-nav { display: flex; align-items: center; gap: 10px; }

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  min-height: 38px;
  color: var(--targon-veil-text);
  background-color: var(--targon-veil-surface);
  background: var(--targon-veil-button);
  border: 1px solid rgba(215, 175, 110, 0.50);
  font-size: 12.5px;
  font-weight: 650;
  border-radius: 9px;
  transition: var(--transition-base);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 210, 220, 0.35),
    inset 0 -2px 5px var(--targon-veil-overlay);
}
.nav-link:hover {
  background: var(--targon-veil-button-hover);
  border-color: var(--targon-veil-accent);
  color: var(--targon-veil-text-strong);
  text-decoration: none;
  box-shadow:
    0 5px 16px rgba(120, 32, 37, 0.40),
    inset 0 1px 0 rgba(255, 220, 230, 0.45),
    0 0 12px rgba(255, 205, 80, 0.3);
  transform: translateY(-1px);
}
.nav-link.active {
  background: var(--targon-veil-button);
  border-color: var(--targon-veil-accent);
  color: var(--targon-veil-text-strong);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 -1px 0 rgba(255, 210, 220, 0.2);
}
.nav-icon {
  flex-shrink: 0;
  color: var(--targon-veil-accent);
  filter: drop-shadow(0 0 4px rgba(255, 210, 80, 0.75));
  opacity: 0.95;
}
.nav-link:hover .nav-icon,
.nav-link.active .nav-icon {
  opacity: 1;
  color: var(--targon-veil-accent-soft);
  filter: drop-shadow(0 0 8px rgba(255, 220, 100, 0.95));
}

/* Player switcher */
.switcher { position: relative; }
.switcher-btn {
  min-height: 38px;
  padding: 4px 12px;
  color: var(--targon-veil-text);
  background-color: var(--targon-veil-surface);
  background: var(--targon-veil-button);
  border: 1px solid rgba(215, 175, 110, 0.50);
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: var(--transition-base);
  user-select: none;
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 210, 220, 0.35),
    inset 0 -2px 5px var(--targon-veil-overlay);
}
.switcher-btn:hover,
.switcher-btn.open {
  background: var(--targon-veil-button-hover);
  border-color: var(--targon-veil-accent);
  color: var(--targon-veil-text-strong);
  box-shadow:
    0 5px 16px rgba(120, 32, 37, 0.40),
    inset 0 1px 0 rgba(255, 220, 230, 0.45),
    0 0 12px rgba(255, 205, 80, 0.3);
  transform: translateY(-1px);
}
.switcher-btn.is-selected {
  border-color: var(--targon-veil-accent);
  background: var(--targon-veil-button);
}
.switcher-btn.is-selected:hover {
  border-color: var(--targon-veil-accent-text);
}
.switcher-user-preview { display: flex; align-items: center; gap: 9px; }
.switcher-avatar {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  object-fit: cover;
  background: rgba(0, 0, 0, 0.4);
}
.switcher-icon-wrap {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.28);
  color: var(--targon-veil-accent-strong);
  border: 1px solid rgba(185, 143, 83, 0.35);
}
.switcher-meta { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; }
.switcher-label {
  font-size: 9px;
  font-weight: 700;
  color: var(--targon-veil-text-warm);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.switcher-name { font-size: 13px; font-weight: 700; color: var(--targon-veil-text-strong); }
.switcher-arrow { color: var(--targon-veil-text-warm); transition: var(--transition-base); flex-shrink: 0; }
.switcher-btn:hover .switcher-arrow,
.switcher-btn.open .switcher-arrow { color: var(--targon-veil-text-strong); }
.switcher-arrow.rotated { transform: rotate(180deg); }

.switcher-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 290px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 11px;
  box-shadow: var(--shadow-overlay);
  z-index: 100;
  overflow: hidden;
}
.switcher-header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
.switcher-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: .05em;
}
.switcher-header-count { font-size: 11px; color: var(--gold-deep); font-weight: 600; }
.switcher-lists { max-height: 280px; overflow-y: auto; }
.switcher-section + .switcher-section { border-top: 1px solid var(--border-soft); }
.switcher-section-title {
  padding: 9px 14px 3px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.switcher-list { padding: 4px 6px 6px; }
.switcher-card-row { display: flex; align-items: center; }
.switcher-card-row .switcher-card { flex: 1; min-width: 0; }
.switcher-remove {
  width: 26px;
  height: 26px;
  margin-right: 5px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  color: var(--text-faint);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.switcher-remove:hover { color: var(--danger); background: var(--loss-soft); }
.switcher-empty { padding: 18px 14px; color: var(--text-faint); font-size: 12px; text-align: center; }
.switcher-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--ink);
  text-decoration: none;
  transition: var(--transition-fast);
  border: 1px solid transparent;
}
.switcher-card:hover { background: var(--surface-alt); text-decoration: none; }
.switcher-card.active { background: var(--primary-soft); border-color: var(--primary-border); }
.switcher-card-avatar { position: relative; width: 34px; height: 34px; flex-shrink: 0; }
.switcher-card-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--border);
}
.switcher-card-active-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--gold);
  border: 2px solid var(--surface);
}
.switcher-card-content { flex: 1; min-width: 0; }
.switcher-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.switcher-card-slug {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-owner-tag-mini {
  color: var(--gold-deep);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}
.badge-region-mini,
.badge-region-xs {
  font-size: 9px;
  font-weight: 700;
  color: var(--gold-deep);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  letter-spacing: .04em;
}
.badge-region-mini { padding: 0 4px; border-radius: 3px; }
.badge-region-xs { padding: 1px 5px; border-radius: 4px; }
.switcher-card-sub { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-faint); }
.switcher-card-riot { color: var(--text-dim); font-weight: 500; }
.switcher-card-sep { opacity: .5; }
.switcher-card-games { color: var(--text-faint); }
.switcher-card-check { color: var(--gold-deep); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.switcher-footer { padding: 6px; border-top: 1px solid var(--border-soft); background: var(--surface-alt); }
.switcher-home-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  transition: var(--transition-fast);
}
.switcher-home-btn:hover { color: var(--gold-deep); background: var(--surface); text-decoration: none; }
.switcher-home-arrow { color: var(--text-faint); transition: var(--transition-transform-fast); }
.switcher-home-btn:hover .switcher-home-arrow { transform: translateX(2px); color: var(--gold-deep); }

.topbar-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }

.app-main-wrapper {
  flex: 1 0 auto;
  width: 100%;
  background: transparent;
  position: relative;
  padding-bottom: 50px;
}

/* Footer — Rouge Targon profond avec draperie organique Solari (tissu mat & terne) */
.site-footer {
  margin-top: 0;
  border-top: 2px solid rgba(195, 155, 90, 0.70);
  background-color: var(--targon-veil-surface-raised);
  background-image: var(--targon-veil-drape);
  background-position: center top;
  background-size: 1920px 100%;
  background-repeat: repeat-x;
  color: var(--targon-veil-text);
  position: relative;
  clear: both;
  box-shadow:
    0 -10px 30px rgba(25, 20, 22, 0.40),
    inset 0 1px 0 rgba(215, 175, 100, 0.35);
}
.site-footer::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 220, 130, 0.8) 50%, transparent);
  pointer-events: none;
}
.footer-inner { max-width: var(--maxw); margin: 0 auto; padding: 52px 24px 30px; }
.footer-grid { display: grid; grid-template-columns: 1.8fr 1.2fr 1.4fr; gap: 40px; margin-bottom: 44px; }
.footer-col { display: flex; flex-direction: column; }
.footer-col-brand { padding-right: 20px; }
.footer-brand { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.footer-brand-title { color: var(--targon-veil-text-strong); font-size: 18.5px; font-weight: 800; letter-spacing: -.01em; }
.footer-brand .brand-badge {
  background: rgba(185, 143, 83, 0.22);
  color: #fce7c8;
  border-color: rgba(185, 143, 83, 0.45);
}
.footer-brand .brand-mark {
  width: 38px;
  height: 38px;
  background: rgba(255, 255, 255, 0.08);
  border: 1.5px solid rgba(195, 155, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 2px 6px var(--targon-veil-overlay);
}
.footer-brand .brand-svg {
  display: block;
  filter: drop-shadow(0 0 6px rgba(255, 215, 80, 0.45));
}
.footer-mission { color: var(--targon-veil-text-soft); font-size: 13px; line-height: 1.6; margin: 0 0 16px; }
.footer-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--targon-veil-overlay);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--targon-veil-text-muted);
}
.disclaimer-icon { flex-shrink: 0; margin-top: 2px; color: var(--gold-soft); }
.footer-heading {
  font-size: 12px;
  font-weight: 750;
  color: var(--targon-veil-accent-strong);
  text-transform: uppercase;
  letter-spacing: .08em;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #fff4bf 0%, #f5b838 50%, #d49229 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(245, 184, 56, 0.45));
}
.footer-accounts-list,
.footer-tech-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-account-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--targon-veil-text-strong);
  text-decoration: none;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: var(--transition-fast);
}
.footer-account-link:hover {
  background: rgba(0, 0, 0, 0.48);
  border-color: var(--gold);
  text-decoration: none;
  transform: translateY(-1px);
}
.footer-account-avatar {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.footer-account-info { display: flex; flex-direction: column; gap: 1px; }
.footer-account-title-row { align-items: center; gap: 6px; }
.footer-account-slug { font-size: 12px; font-weight: 700; color: var(--targon-veil-text-strong); }
.footer-account-games { font-size: 10px; color: var(--targon-veil-text-muted); }
.footer-tech-list li { display: flex; flex-direction: column; gap: 2px; }
.tech-pill { font-weight: 650; color: var(--targon-veil-text-strong); font-size: 12px; }
.tech-desc { font-size: 11px; color: var(--targon-veil-text-muted); }
.footer-bottom {
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.footer-copyright {
  font-size: 12px;
  color: var(--targon-veil-text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.footer-sep { opacity: .4; }
.footer-link-subtle { color: var(--targon-veil-text-soft); text-decoration: none; transition: var(--transition-fast); font-size: 12px; }
.footer-link-subtle:hover { color: var(--targon-veil-accent-strong); text-decoration: underline; }
.footer-scroll-top {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--targon-veil-overlay);
  border: 1px solid var(--targon-veil-border);
  border-radius: 8px;
  color: var(--targon-veil-text-strong);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: var(--transition-fast);
}
.footer-scroll-top:hover { color: var(--targon-veil-accent-strong); border-color: var(--gold); background: rgba(0, 0, 0, 0.55); }
.footer-bottom-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* Navigation Desktop & Mobile Menu elements */
.desktop-nav-links {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-menu-btn {
  display: none;
  width: 38px;
  height: 38px;
  padding: 0;
  background-color: var(--targon-veil-surface);
  background: var(--targon-veil-button);
  border: 1px solid rgba(215, 175, 110, 0.50);
  border-radius: 9px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 210, 220, 0.35);
  transition: var(--transition-base);
  flex-shrink: 0;
}

.mobile-menu-btn:hover {
  background: var(--targon-veil-button-hover);
  border-color: var(--targon-veil-accent);
}

.hamburger-box {
  width: 18px;
  height: 14px;
  position: relative;
  display: inline-block;
}

.hamburger-inner,
.hamburger-inner::before,
.hamburger-inner::after {
  width: 18px;
  height: 2px;
  background-color: var(--targon-veil-accent);
  border-radius: 2px;
  position: absolute;
  transition: transform 0.2s ease, top 0.2s ease, opacity 0.2s ease;
}

.hamburger-inner {
  top: 6px;
  display: block;
}

.hamburger-inner::before {
  content: "";
  top: -6px;
  left: 0;
}

.hamburger-inner::after {
  content: "";
  top: 6px;
  left: 0;
}

.hamburger-inner.is-active {
  background-color: transparent;
}

.hamburger-inner.is-active::before {
  top: 0;
  transform: rotate(45deg);
  background-color: var(--targon-veil-accent-soft);
}

.hamburger-inner.is-active::after {
  top: 0;
  transform: rotate(-45deg);
  background-color: var(--targon-veil-accent-soft);
}

/* Mobile drawer */
.mobile-drawer {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: rgba(22, 14, 16, 0.97);
  border-bottom: 1.5px solid rgba(195, 160, 110, 0.40);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.50);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 99;
  animation: mobileDrawerSlide 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes mobileDrawerSlide {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mobile-drawer-inner {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 540px;
  margin: 0 auto;
}

.mobile-drawer-title {
  font-size: 10.5px;
  font-weight: 750;
  color: var(--targon-veil-text-warm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.mobile-drawer-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-nav-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(215, 175, 110, 0.20);
  text-decoration: none;
  transition: var(--transition-fast);
}

.mobile-nav-card:hover,
.mobile-nav-card.active {
  background: rgba(215, 175, 110, 0.12);
  border-color: rgba(255, 210, 105, 0.60);
  text-decoration: none;
}

.mobile-nav-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--targon-veil-overlay);
  border: 1px solid var(--targon-veil-border-warm);
  color: var(--targon-veil-accent);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.mobile-nav-icon-wrap.gold-glow {
  color: var(--targon-veil-accent-text);
  border-color: rgba(255, 210, 80, 0.65);
  box-shadow: 0 0 12px rgba(255, 210, 80, 0.25);
}

.mobile-nav-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.mobile-nav-head-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-nav-heading {
  font-size: 14px;
  font-weight: 700;
  color: var(--targon-veil-text-strong);
}

.mobile-nav-desc {
  font-size: 11.5px;
  color: #c9baa8;
}

.badge-gold-glow {
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(185, 143, 83, 0.30);
  border: 1px solid rgba(255, 210, 80, 0.55);
  color: var(--targon-veil-accent-text);
}

.mobile-drawer-footer {
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.mobile-legal-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
}

.mobile-legal-link {
  color: #b5a595;
  text-decoration: none;
  transition: color 0.15s;
}

.mobile-legal-link:hover {
  color: var(--targon-veil-accent-text);
  text-decoration: underline;
}

@media (max-width: 1100px) {
  .topbar-center { max-width: 440px; }
}

@media (max-width: 960px) {
  .topbar-center { max-width: 320px; }
  .topbar-inner { gap: 16px; padding: 0 18px; }
  .brand-badge { display: none; }
}

@media (max-width: 800px) {
  .topbar-inner {
    height: auto;
    min-height: 54px;
    padding: 10px 16px 8px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .topbar-left {
    order: 1;
    flex: 1 1 auto;
  }
  .topbar-right {
    order: 2;
    margin-left: auto;
    gap: 8px;
  }
  .topbar-center {
    order: 3;
    width: 100%;
    max-width: 100%;
    margin: 4px 0 2px;
  }
  .brand-badge {
    display: none;
  }
  .desktop-nav-links {
    display: none !important;
  }
  .mobile-menu-btn {
    display: inline-flex;
  }
  .switcher-dropdown {
    right: 0;
    left: auto;
    max-width: calc(100vw - 32px);
    width: min(300px, calc(100vw - 32px));
  }
  .switcher-name {
    max-width: 95px;
  }
  .footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  .footer-col-brand { grid-column: 1 / -1; padding-right: 0; }
}

@media (max-width: 480px) {
  .topbar-inner {
    padding: 8px 12px 6px;
    gap: 6px;
  }
  .brand-mark {
    width: 34px;
    height: 34px;
  }
  .brand-mark .brand-svg {
    width: 22px;
    height: 22px;
  }
  .brand-text {
    font-size: 16px;
  }
  .switcher-label {
    display: none;
  }
  .switcher-btn {
    padding: 4px 8px;
    gap: 6px;
  }
  .switcher-name {
    max-width: 75px;
    font-size: 12px;
  }
  .footer-grid { grid-template-columns: 1fr; gap: 28px; }
  .footer-inner { padding: 40px 16px 24px; }
  .footer-bottom { flex-direction: column; align-items: flex-start; gap: 14px; }
}
</style>
