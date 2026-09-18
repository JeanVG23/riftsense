<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import { formatDate, formatPseudo, isOwnerAccount, summonerIcon, summonerLevel } from "../account-profile";
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

watch(
  () => props.recentAccounts,
  (val) => {
    if (val) localRecentAccounts.value = val;
  },
  { immediate: true, deep: true }
);

function refreshStoredAccounts(): void {
  localRecentAccounts.value = readRecentAccounts();
}

onMounted(() => {
  window.addEventListener(RECENT_ACCOUNTS_CHANGED, refreshStoredAccounts);
});

onBeforeUnmount(() => {
  window.removeEventListener(RECENT_ACCOUNTS_CHANGED, refreshStoredAccounts);
});

const browserAccounts = computed(() => {
  const publicSlugs = new Set(props.accounts.map(a => a.slug));
  return localRecentAccounts.value.filter(account => !publicSlugs.has(account.slug));
});

function forgetStoredAccount(slug: string): void {
  localRecentAccounts.value = removeRecentAccount(slug);
  window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
}

const ownerAccounts = computed(() => props.accounts.filter(isOwnerAccount));
const permanentAccounts = computed(() => props.accounts.filter(a => !isOwnerAccount(a)));

function navigateTo(slug: string): void {
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  void router.push(`/c/${slug}`);
}
</script>

<template>
  <div class="home-page-container">
    <section class="page-intro home-intro">
      <div class="hero-live-pill">
        <span class="live-indicator-dot"></span>
        <span class="hero-live-text">MOTEUR PRÉDICTIF EBM &amp; EXPLICABILITÉ SHAP</span>
      </div>
      <h1 class="hero-headline">
        L'analyse de tes parties, <span class="text-gradient-cyan">décryptée par le ML</span>.
      </h1>
      <p class="hero-subline">
        Saisis ton <strong>Riot ID</strong> pour extraire tes <strong>20 dernières parties SoloQ</strong>, calculer ton <strong>rang estimé</strong> et identifier tes leviers de jeu prioritaires grâce aux <strong>valeurs SHAP</strong>.
      </p>

      <!-- Formulaire d'analyse immédiat au cœur du Hero -->
      <RegisterForm />
    </section>

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
              <span>SESSION LOCALE</span>
            </div>
            <h2 id="browser-accounts-heading" class="home-section-title">Comptes sur ce navigateur</h2>
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
                  <div class="ac-slug-row">
                    <span class="ac-slug">{{ formatPseudo(account) }}</span>
                    <div class="ac-badges">
                      <span class="badge badge-browser-tag">Enregistré</span>
                      <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                    </div>
                  </div>
                  <div class="ac-riot">{{ account.riot_id }}</div>
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
                <div class="ac-slug-row">
                  <span class="ac-slug">{{ formatPseudo(account) }}</span>
                  <div class="ac-badges">
                    <span v-if="account.slug === 'spadzze' || account.slug === 'aceofspadzze'" class="badge badge-shap">Modèle SHAP</span>
                    <span class="badge badge-owner-tag">Mon compte</span>
                    <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                  </div>
                </div>
                <div class="ac-riot">{{ account.riot_id }}</div>
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
              <span>BENCHMARK &amp; ROSTER</span>
            </div>
            <h2 id="permanent-accounts-heading" class="home-section-title">Comptes permanents</h2>
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
                <div class="ac-slug-row">
                  <span class="ac-slug">{{ formatPseudo(account) }}</span>
                  <div class="ac-badges">
                    <span class="badge badge-permanent-tag">Référence</span>
                    <span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span>
                  </div>
                </div>
                <div class="ac-riot">{{ account.riot_id }}</div>
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
