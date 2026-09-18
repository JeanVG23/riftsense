<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import {
  accountRank,
  formatAccountRank,
  formatDate,
  formatPseudo,
  isOwnerAccount,
  rankEmblem,
  summonerIcon,
  summonerLevel,
  tierAccent,
  type CurrentRank,
} from "../account-profile";
import RegisterForm from "../components/RegisterForm.ce.vue";
import {
  readRecentAccounts,
  removeRecentAccount,
  RECENT_ACCOUNTS_CHANGED,
  type RecentAccount,
} from "../recent-accounts";

const props = defineProps<{
  accounts: any[];
  recentAccounts?: RecentAccount[];
  loading: boolean;
}>();
const router = useRouter();

const localRecentAccounts = ref<RecentAccount[]>(props.recentAccounts ?? readRecentAccounts());

const browserAccounts = computed(() => {
  const publicSlugs = new Set(props.accounts.map(a => a.slug));
  return localRecentAccounts.value.filter(account => !publicSlugs.has(account.slug));
});

const ownerAccounts = computed(() => props.accounts.filter(isOwnerAccount));
const permanentAccounts = computed(() => props.accounts.filter(a => !isOwnerAccount(a)));

const dynamicRanks = ref<Record<string, CurrentRank>>({});

function getRank(account: any): CurrentRank | null {
  const dyn = account?.slug ? dynamicRanks.value[account.slug] : null;
  if (dyn?.tier) return dyn;
  return accountRank(account);
}

async function fetchRanks(): Promise<void> {
  const all = [...(props.accounts || []), ...(browserAccounts.value || [])];
  for (const acc of all) {
    if (!acc?.slug) continue;
    if (getRank(acc)?.tier) continue;
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(acc.slug)}/rank`);
      if (res.ok) {
        const data = await res.json();
        if (data?.tier) dynamicRanks.value[acc.slug] = data;
      }
    } catch {
      // Repli gracieux
    }
  }
}

watch(
  () => props.recentAccounts,
  (val) => {
    if (val) localRecentAccounts.value = val;
  },
  { immediate: true, deep: true }
);

watch(
  () => [props.accounts, browserAccounts.value],
  () => {
    void fetchRanks();
  }
);

function refreshStoredAccounts(): void {
  localRecentAccounts.value = readRecentAccounts();
}

onMounted(() => {
  window.addEventListener(RECENT_ACCOUNTS_CHANGED, refreshStoredAccounts);
  void fetchRanks();
});

onBeforeUnmount(() => {
  window.removeEventListener(RECENT_ACCOUNTS_CHANGED, refreshStoredAccounts);
});

function forgetStoredAccount(slug: string): void {
  localRecentAccounts.value = removeRecentAccount(slug);
  window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
}

function navigateTo(slug: string): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  void router.push(`/c/${slug}`);
}

function goToDemo(): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  void router.push({ path: "/c/spadzze", query: { review: "EUW1_7898084645" } });
}
</script>

<template>
  <div class="home-page-container">
    <section class="home-intro">
      <!-- Toile de fond Targon & Artefact en transparence fondue (sans cadre, sans bordure) -->
      <div class="home-targon-backdrop" aria-hidden="true">
        <div class="targon-landscape-layer"></div>
        <div class="targon-astrolabe-layer"></div>
      </div>

      <div class="hero-content">
        <h1 class="hero-headline">
          Analyse de performance et coaching tactique sur <span class="text-gold">League of Legends</span>.
        </h1>
        <p class="hero-subline">
          Évalue tes <strong>20 dernières parties SoloQ</strong> face aux standards Challenger. Découvre ton <strong>rang estimé</strong>, explore tes leviers de progression grâce aux <strong>valeurs SHAP</strong> et accède au débrief tactique de chaque match.
        </p>

        <!-- Formulaire d'analyse immédiat au cœur du Hero -->
        <RegisterForm />

        <div class="hero-demo-action">
          <span class="hero-demo-prompt">Pas de compte Riot sous la main ?</span>
          <a class="hero-demo-link" href="/c/spadzze?review=EUW1_7898084645" @click.prevent="goToDemo">
            Tester la démo complète (Spadzze#EUW) →
          </a>
        </div>
      </div>
    </section>

    <!-- Séparation céleste Targon entre le haut (Hero) et les sections -->
    <div class="home-hero-divider" aria-hidden="true">
      <span class="divider-line"></span>
      <span class="divider-gem">✦</span>
      <span class="divider-line"></span>
    </div>

    <!-- Artefacts sacrés le long de la page sur les côtés en transparence -->
    <div class="home-side-artefacts" aria-hidden="true">
      <div class="side-artefact side-artefact--relique"></div>
      <div class="side-artefact side-artefact--armes"></div>
      <div class="side-artefact side-artefact--stele"></div>
    </div>

    <div v-if="loading" class="state home-loading-state">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Chargement des comptes…</span>
    </div>
    <div v-else-if="!accounts.length" class="state">
      Aucun compte configuré.
    </div>
    <div v-else class="home-sections">
      <!-- Section 0 : Comptes mémorisés dans ce navigateur (Session locale) -->
      <section
        v-if="browserAccounts.length"
        class="home-section home-section--browser"
        aria-labelledby="browser-accounts-heading"
      >
        <div class="home-section-header">
          <div class="home-section-title-wrap">
            <div class="home-section-eyebrow eyebrow-browser">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/>
              </svg>
              <span>HISTORIQUE LOCAL</span>
            </div>
            <h2 id="browser-accounts-heading" class="home-section-title">Joueurs récemment consultés</h2>
            <p class="home-section-subtitle">Profils mémorisés dans votre session de navigation.</p>
          </div>
          <span class="home-section-count">{{ browserAccounts.length }} compte{{ browserAccounts.length > 1 ? "s" : "" }}</span>
        </div>

        <div class="accounts-grid accounts-grid--browser">
          <div
            v-for="account in browserAccounts"
            :key="account.slug"
            class="account-card account-card--browser"
          >
            <a
              class="account-card-link"
              :href="`/c/${account.slug}`"
              @click.prevent="navigateTo(account.slug)"
            >
              <div class="ac-heading">
                <div class="summoner-avatar-wrap ac-avatar-wrap">
                  <img class="summoner-avatar ac-avatar-img" :src="summonerIcon(account)" alt="" loading="lazy">
                  <span v-if="summonerLevel(account)" class="summoner-level ac-level-badge">
                    Niv. {{ summonerLevel(account) }}
                  </span>
                </div>
                <div class="ac-identity">
                  <div class="ac-title-row ac-slug-row">
                    <span class="ac-slug" :title="formatPseudo(account)">{{ formatPseudo(account) }}</span>
                    <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                  </div>
                  <div class="ac-sub-row">
                    <span class="ac-riot">{{ account.riot_id }}</span>
                    <div class="ac-badges">
                      <span
                        v-if="getRank(account)"
                        class="badge-rank"
                        :class="tierAccent(getRank(account)?.tier)"
                      >
                        <img
                          v-if="rankEmblem(getRank(account)?.tier)"
                          class="rank-mini-emblem"
                          :src="rankEmblem(getRank(account)?.tier)"
                          alt=""
                          loading="lazy"
                        >
                        <span>{{ formatAccountRank(getRank(account)) }}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <span class="ac-arrow" aria-hidden="true">→</span>
              </div>
              <div class="ac-stats row">
                <span class="num">{{ account.games_count ? `${account.games_count} parties enregistrées` : "Parties analysées" }}</span>
                <span v-if="account.last_visited_at" class="faint">
                  · consulté le {{ formatDate(account.last_visited_at) }}
                </span>
              </div>
            </a>
            <button
              type="button"
              class="btn-remove-stored-account"
              :aria-label="`Retirer ${account.riot_id} de ce navigateur`"
              title="Retirer de ce navigateur"
              @click.stop.prevent="forgetStoredAccount(account.slug)"
            >
              <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <!-- Section 1 : Mes comptes personnels (spadzze, aceofspadzze, etc.) -->
      <section class="home-section" aria-labelledby="owner-accounts-heading">
        <div class="home-section-header">
          <div class="home-section-title-wrap">
            <div class="home-section-eyebrow eyebrow-owner">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              <span>ESPACE PERSONNEL</span>
            </div>
            <h2 id="owner-accounts-heading" class="home-section-title">Mes comptes</h2>
          </div>
          <span class="home-section-count">{{ ownerAccounts.length }} compte{{ ownerAccounts.length > 1 ? "s" : "" }}</span>
        </div>

        <div class="accounts-grid accounts-grid--owner">
          <a
            v-for="account in ownerAccounts"
            :key="account.slug"
            class="account-card account-card--owner"
            :href="`/c/${account.slug}`"
            @click.prevent="navigateTo(account.slug)"
          >
            <div class="ac-heading">
              <div class="summoner-avatar-wrap ac-avatar-wrap">
                <img class="summoner-avatar ac-avatar-img" :src="summonerIcon(account)" alt="" loading="lazy">
                <span v-if="summonerLevel(account)" class="summoner-level ac-level-badge">
                  Niv. {{ summonerLevel(account) }}
                </span>
              </div>
              <div class="ac-identity">
                <div class="ac-title-row ac-slug-row">
                  <span class="ac-slug" :title="formatPseudo(account)">{{ formatPseudo(account) }}</span>
                  <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                </div>
                <div class="ac-sub-row">
                  <span class="ac-riot">{{ account.riot_id }}</span>
                  <div class="ac-badges">
                    <span
                      v-if="getRank(account)"
                      class="badge-rank"
                      :class="tierAccent(getRank(account)?.tier)"
                    >
                      <img
                        v-if="rankEmblem(getRank(account)?.tier)"
                        class="rank-mini-emblem"
                        :src="rankEmblem(getRank(account)?.tier)"
                        alt=""
                        loading="lazy"
                      >
                      <span>{{ formatAccountRank(getRank(account)) }}</span>
                    </span>
                    <span v-if="account.slug === 'spadzze' || account.slug === 'aceofspadzze'" class="badge badge-shap">Modèle SHAP</span>
                  </div>
                </div>
              </div>
              <span class="ac-arrow" aria-hidden="true">→</span>
            </div>
            <div class="ac-stats row">
              <span class="num">{{ account.games_count }} parties enregistrées</span>
              <span class="faint">
                {{ account.last_review_ts ? `· coaching le ${formatDate(account.last_review_ts)}` : "· pas encore de coaching" }}
              </span>
            </div>
          </a>
        </div>
      </section>

      <!-- Section 2 : Comptes permanents / Référence (vangy, vlintter, bobby-lupo, etc.) -->
      <section v-if="permanentAccounts.length" class="home-section" aria-labelledby="permanent-accounts-heading">
        <div class="home-section-header">
          <div class="home-section-title-wrap">
            <div class="home-section-eyebrow eyebrow-permanent">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM5.5 10a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z"/>
              </svg>
              <span>BENCHMARK &amp; DÉMONSTRATION</span>
            </div>
            <h2 id="permanent-accounts-heading" class="home-section-title">Profils de référence</h2>
            <p class="home-section-subtitle">Données réelles complètes avec décomposition SHAP et revues tactiques.</p>
          </div>
          <span class="home-section-count">{{ permanentAccounts.length }} compte{{ permanentAccounts.length > 1 ? "s" : "" }}</span>
        </div>

        <div class="accounts-grid accounts-grid--permanent">
          <a
            v-for="account in permanentAccounts"
            :key="account.slug"
            class="account-card"
            :href="`/c/${account.slug}`"
            @click.prevent="navigateTo(account.slug)"
          >
            <div class="ac-heading">
              <div class="summoner-avatar-wrap ac-avatar-wrap">
                <img class="summoner-avatar ac-avatar-img" :src="summonerIcon(account)" alt="" loading="lazy">
                <span v-if="summonerLevel(account)" class="summoner-level ac-level-badge">
                  Niv. {{ summonerLevel(account) }}
                </span>
              </div>
              <div class="ac-identity">
                <div class="ac-title-row ac-slug-row">
                  <span class="ac-slug" :title="formatPseudo(account)">{{ formatPseudo(account) }}</span>
                  <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                </div>
                <div class="ac-sub-row">
                  <span class="ac-riot">{{ account.riot_id }}</span>
                  <div class="ac-badges">
                    <span
                      v-if="getRank(account)"
                      class="badge-rank"
                      :class="tierAccent(getRank(account)?.tier)"
                    >
                      <img
                        v-if="rankEmblem(getRank(account)?.tier)"
                        class="rank-mini-emblem"
                        :src="rankEmblem(getRank(account)?.tier)"
                        alt=""
                        loading="lazy"
                      >
                      <span>{{ formatAccountRank(getRank(account)) }}</span>
                    </span>
                  </div>
                </div>
              </div>
              <span class="ac-arrow" aria-hidden="true">→</span>
            </div>
            <div class="ac-stats row">
              <span class="num">{{ account.games_count }} parties enregistrées</span>
              <span class="faint">
                {{ account.last_review_ts ? `· coaching le ${formatDate(account.last_review_ts)}` : "· pas encore de coaching" }}
              </span>
            </div>
          </a>
        </div>
      </section>
    </div>

    <!-- Section pédagogique du parcours -->
    <section class="home-workflow-section" aria-labelledby="workflow-heading">
      <div class="home-section-header">
        <div class="home-section-title-wrap">
          <div class="home-section-eyebrow eyebrow-workflow">
            <span class="eyebrow-dot"></span>
            <span>MÉTHODOLOGIE SCIENTIFIQUE</span>
          </div>
          <h2 id="workflow-heading" class="home-section-title">Comment fonctionne l'analyse RiftSense</h2>
        </div>
      </div>

      <div class="workflow-steps-grid">
        <div class="workflow-step-card">
          <div class="step-card-num">01</div>
          <div class="step-card-title">Collecte officielle Riot</div>
          <p class="step-card-desc">
            Via les endpoints <span class="mono">account-v1</span> et <span class="mono">match-v5</span>, nous extrayons les <strong>20 dernières parties Solo/Duo</strong> et leurs <strong>timelines complètes</strong> à 60s d'intervalle.
          </p>
          <div class="step-card-footer">
            <span class="step-tag">100% Post-game</span>
            <span class="step-tag">Fog of War respecté</span>
          </div>
        </div>

        <div class="workflow-step-card">
          <div class="step-card-num">02</div>
          <div class="step-card-title">Extraction des features macro</div>
          <p class="step-card-desc">
            Reconstitution des <strong>mouvements de lane</strong>, timings de recall, <strong>dead time de gold</strong>, <strong>présence aux objectifs</strong> dragons/barons et contexte de matchup.
          </p>
          <div class="step-card-footer">
            <span class="step-tag">Positionnement x/y</span>
            <span class="step-tag">Benchmark challenger</span>
          </div>
        </div>

        <div class="workflow-step-card">
          <div class="step-card-num">03</div>
          <div class="step-card-title">Modèle EBM &amp; Valeurs SHAP</div>
          <p class="step-card-desc">
            L'algorithme <strong>Explainable Boosting Machine</strong> classe ton profil et calcule l'<strong>impact exact (valeur SHAP)</strong> de chaque statistique pour expliquer ton niveau estimé.
          </p>
          <div class="step-card-footer">
            <span class="step-tag">Explicabilité totale</span>
            <span class="step-tag">Forces &amp; axes de travail</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Targon Éditorial — home */
.home-page-container {
  display: flex;
  flex-direction: column;
  gap: 36px;
  width: 100%;
}

.hero-banner {
  display: contents;
}

/* Hero unboxed avec arrière-plan Targon en transparence fluide */
.home-intro {
  position: relative;
  width: 100%;
  padding: 32px 0 16px;
}

/* Toile de fond Targon & Artefact en transparence fondue (sans cadre, sans bordure) */
.home-targon-backdrop {
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  height: 620px;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  mask-image: radial-gradient(ellipse 80% 65% at 50% 25%, black 20%, transparent 85%),
              linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 65% at 50% 25%, black 20%, transparent 85%),
                      linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

.targon-landscape-layer {
  position: absolute;
  inset: 0;
  background: url('/images/targon-hero.jpg') center 18% / cover no-repeat;
  opacity: 0.22;
  mix-blend-mode: multiply;
  filter: saturate(1.22) contrast(1.15);
}

.targon-astrolabe-layer {
  position: absolute;
  top: -30px;
  right: calc(50% - 600px);
  width: 540px;
  height: 540px;
  background: url('/images/targon/astrolabe-or.jpg') center / contain no-repeat;
  opacity: 0.25;
  mix-blend-mode: multiply;
  filter: contrast(1.18) drop-shadow(0 0 45px rgba(185, 143, 83, 0.35));
  border-radius: 50%;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  max-width: 820px;
}

.hero-headline {
  margin: 0;
  color: var(--ink);
  font-size: clamp(32px, 4.4vw, 46px);
  line-height: 1.14;
  letter-spacing: -.035em;
  font-weight: 800;
  width: 100%;
  text-wrap: balance;
}

.hero-headline .text-gold {
  color: var(--gold-deep);
  background: linear-gradient(135deg, #7e6134 0%, #b98f53 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subline {
  width: 100%;
  max-width: 680px;
  margin: 16px 0 20px;
  color: var(--text-dim);
  font-size: 16.5px;
  line-height: 1.6;
}

.hero-subline strong {
  color: var(--ink);
  font-weight: 700;
}

.hero-demo-action {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  font-size: 14px;
  color: var(--text-dim);
}

.hero-demo-prompt {
  color: var(--text-faint);
}

.hero-demo-link {
  color: var(--gold-deep);
  font-weight: 700;
  text-decoration: none;
  transition: var(--transition-fast);
}

.hero-demo-link:hover {
  color: var(--gold);
  text-decoration: underline;
}

@media (max-width: 768px) {
  .home-targon-backdrop {
    height: 480px;
  }
  .targon-astrolabe-layer {
    right: -40px;
    width: 300px;
    height: 300px;
    opacity: 0.15;
  }
  .hero-headline {
    font-size: 28px;
  }
}

/* Artefacts Targon sacrés en filigrane le long de la page sur les côtés */
.home-side-artefacts {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.side-artefact {
  position: absolute;
  mix-blend-mode: multiply;
  pointer-events: none;
}

/* Relique sacrée Solari - côté gauche vers 'Mes comptes' */
.side-artefact--relique {
  top: 500px;
  left: max(10px, calc(50% - 690px));
  width: 320px;
  height: 320px;
  background: url('/images/targon/relique-sacree.jpg') center / contain no-repeat;
  opacity: 0.17;
  mask-image: radial-gradient(circle at center, black 32%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle at center, black 32%, transparent 75%);
  filter: contrast(1.15) drop-shadow(0 0 35px rgba(185, 143, 83, 0.30));
}

/* Armes et lances célestes Rahorak - côté droit vers 'Méthodologie' */
.side-artefact--armes {
  top: 940px;
  right: max(10px, calc(50% - 710px));
  width: 380px;
  height: 380px;
  background: url('/images/targon/armes-rahoraks.jpg') center / contain no-repeat;
  opacity: 0.16;
  mask-image: radial-gradient(circle at center, black 28%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle at center, black 28%, transparent 75%);
  filter: contrast(1.15) drop-shadow(0 0 35px rgba(120, 32, 37, 0.25));
}

/* Stèle funéraire et runes ancestrales - côté gauche vers le bas */
.side-artefact--stele {
  top: 1320px;
  left: max(15px, calc(50% - 670px));
  width: 300px;
  height: 440px;
  background: url('/images/targon/stele-targon.jpg') center / contain no-repeat;
  opacity: 0.14;
  mask-image: radial-gradient(ellipse 65% 80% at center, black 25%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 65% 80% at center, black 25%, transparent 80%);
  filter: contrast(1.12);
}

@media (max-width: 1200px) {
  .side-artefact--relique {
    opacity: 0.09;
    left: -40px;
  }
  .side-artefact--armes {
    opacity: 0.09;
    right: -40px;
  }
  .side-artefact--stele {
    display: none;
  }
}

@media (max-width: 800px) {
  .home-side-artefacts {
    display: none;
  }
}

/* Séparation céleste Targon */
.home-hero-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  width: 100%;
  max-width: 1040px;
  margin: 6px auto 14px;
  padding: 0 16px;
  position: relative;
  z-index: 2;
}

.home-hero-divider .divider-line {
  flex: 1;
  height: 1px;
}

.home-hero-divider .divider-line:first-child {
  background: linear-gradient(90deg, transparent, rgba(120, 32, 37, 0.35) 25%, rgba(185, 143, 83, 0.45) 70%, rgba(185, 143, 83, 0.7) 100%);
}

.home-hero-divider .divider-line:last-child {
  background: linear-gradient(90deg, rgba(185, 143, 83, 0.7) 0%, rgba(185, 143, 83, 0.45) 30%, rgba(120, 32, 37, 0.35) 75%, transparent);
}

.home-hero-divider .divider-gem {
  color: var(--gold-deep);
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
  filter: drop-shadow(0 0 6px rgba(185, 143, 83, 0.45));
  user-select: none;
}

/* Sections */
.home-loading-state { display: flex; align-items: center; justify-content: center; gap: 10px; position: relative; z-index: 1; }
.home-sections { display: flex; flex-direction: column; gap: 36px; position: relative; z-index: 1; }
.home-section { display: flex; flex-direction: column; gap: 16px; }
.home-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}
.home-section-title-wrap { display: flex; flex-direction: column; gap: 5px; }
.home-section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--gold-deep);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.home-section-eyebrow svg { color: var(--gold); }
.eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); }
.home-section-title { font-size: 20px; font-weight: 720; color: var(--ink); }
.home-section-subtitle { margin: 0; color: var(--text-faint); font-size: 13px; }
.home-section-count {
  min-width: 32px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 650;
  text-align: center;
  flex-shrink: 0;
}

.accounts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.account-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 142px;
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(20, 23, 24, .04);
  transition: var(--transition-base);
}
.account-card:hover,
.account-card:focus-within {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow: var(--card-shadow-hover);
}
.account-card-link { display: flex; flex-direction: column; gap: 14px; color: inherit; text-decoration: none; }
.account-card-link:hover { color: inherit; text-decoration: none; }
.account-card--browser { background: var(--surface-alt); }
.account-card--owner { border-color: var(--primary-border); }

.ac-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.account-card--browser .ac-heading {
  padding-right: 20px;
}
.ac-avatar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  margin-bottom: 2px;
}
.ac-avatar-img {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  object-fit: cover;
  border: 1.5px solid var(--border);
  background: var(--surface);
  box-shadow: 0 2px 5px rgba(20, 23, 24, 0.04);
}
.ac-level-badge {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  font-size: 9.5px;
  font-weight: 750;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  letter-spacing: .02em;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}
.ac-identity {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ac-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ac-slug {
  font-size: 16px;
  font-weight: 750;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.ac-sub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}
.ac-riot {
  font-size: 12.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.ac-arrow {
  color: var(--text-faint);
  font-size: 15px;
  transition: var(--transition-transform-fast);
  flex-shrink: 0;
}
.account-card:hover .ac-arrow {
  color: var(--gold-deep);
  transform: translateX(3px);
}
.ac-stats {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-size: 12px;
}
.btn-remove-stored-account {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--text-faint);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  opacity: .4;
  transition: var(--transition-fast);
}
.btn-remove-stored-account:hover { color: var(--danger); background: var(--loss-soft); opacity: 1; }

.badge-browser-tag,
.badge-owner-tag,
.badge-permanent-tag,
.badge-shap {
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
.badge-owner-tag { color: var(--gold-deep); }
.badge-permanent-tag { color: var(--text-dim); background: var(--surface-alt); border-color: var(--border); }
.badge-shap { color: var(--info); background: rgba(62, 109, 140, .08); border-color: rgba(62, 109, 140, .22); }

.badge-rank {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1.5px 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  letter-spacing: .015em;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  color: var(--ink);
  flex-shrink: 0;
}
.rank-mini-emblem {
  width: 13px;
  height: 13px;
  object-fit: contain;
  flex-shrink: 0;
}
.badge-rank[class*="tier-accent-"] {
  border-color: color-mix(in srgb, var(--tier-color) 40%, transparent);
  background: color-mix(in srgb, var(--tier-color) 10%, var(--surface));
  color: var(--tier-color);
}

/* Workflow */
.home-workflow-section { position: relative; z-index: 1; }
.workflow-steps-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.workflow-step-card {
  position: relative;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(20, 23, 24, .04);
}
.step-card-num {
  margin-bottom: 14px;
  color: var(--gold);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}
.step-card-title { margin-bottom: 7px; font-size: 15px; font-weight: 700; color: var(--ink); }
.step-card-desc { margin: 0; color: var(--text-dim); font-size: 13px; line-height: 1.55; }
.step-card-footer { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.step-tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: .04em;
  white-space: nowrap;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(126, 97, 52, .2);
  border-top-color: var(--gold-deep);
  border-radius: 50%;
  animation: home-spin .8s linear infinite;
}
@keyframes home-spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .workflow-steps-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .hero-banner { padding: 34px 26px 30px; }
  .hero-preview-card { align-self: stretch; }
}
@media (max-width: 768px) {
  .accounts-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .home-page-container { gap: 28px; }
  .home-sections, .home-section { gap: 22px; }
  .home-section-header { align-items: flex-start; flex-direction: column; }
  .preview-rank-badge { align-items: flex-start; }
  .preview-metrics-grid { grid-template-columns: 1fr; }
  .preview-tip-box { align-items: flex-start; flex-direction: column; }
  .preview-cta-btn { width: 100%; justify-content: center; }
}
@media (max-width: 640px) {
  .hero-banner { padding: 28px 20px; border-radius: 14px; }
  .hero-headline { font-size: 30px; }
  .workflow-steps-grid { grid-template-columns: 1fr; }
  .ac-arrow { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .account-card, .hero-preview-card, .ac-arrow, .preview-cta-btn { transition: none; }
  .loading-spinner { animation-duration: .01ms; }
}
</style>
