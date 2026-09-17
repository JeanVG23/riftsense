<script setup lang="ts">
import { useRouter } from "vue-router";
import { formatDate, summonerIcon, summonerLevel } from "../account-profile";
import RegisterForm from "../components/RegisterForm.ce.vue";

defineProps<{ accounts: any[]; loading: boolean }>();
const router = useRouter();
</script>

<template>
  <section class="page-intro home-intro">
    <p class="eyebrow">ANALYSE DE PARTIES</p>
    <h1>Ton coaching, fondé sur tes parties.</h1>
    <p>Choisis un compte pour retrouver ses parties, ses axes de progression et son profil de jeu.</p>
  </section>
  <div v-if="loading" class="state">Chargement des comptes…</div>
  <div v-else-if="!accounts.length" class="state">Aucun compte configuré.</div>
  <div v-else class="accounts-grid">
    <a v-for="account in accounts" :key="account.slug" class="account-card" :href="`/c/${account.slug}`" @click.prevent="router.push(`/c/${account.slug}`)">
      <div class="ac-heading">
        <div class="summoner-avatar-wrap ac-avatar-wrap"><img class="summoner-avatar ac-avatar-img" :src="summonerIcon(account.slug)" alt="" loading="lazy"><span v-if="summonerLevel(account.slug)" class="summoner-level ac-level-badge">Niv. {{ summonerLevel(account.slug) }}</span></div>
        <div class="ac-identity"><div class="ac-slug-row"><span class="ac-slug">{{ account.slug }}</span><span class="badge badge-region">{{ (account.region || "euw1").slice(0, 3).toUpperCase() }}</span></div><div class="ac-riot">{{ account.riot_id }}</div></div>
        <span class="ac-arrow" aria-hidden="true">→</span>
      </div>
      <div class="ac-stats row"><span class="num">{{ account.games_count }} parties analysées</span><span class="faint">{{ account.last_review_ts ? `· coaching le ${formatDate(account.last_review_ts)}` : "· pas encore de coaching" }}</span></div>
    </a>
  </div>
  <RegisterForm />
</template>
