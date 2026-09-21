<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { titleCase, type PredictedRank } from "../account-profile";
import { authToken, openCoachAuth, setStoredAuthToken, withAuthHeaders } from "../auth";
import { gameChampion, gameMatchId, type GameReview } from "../game-review";
import { RECENT_ACCOUNTS_CHANGED, rememberRecentAccount } from "../recent-accounts";
import AccountProfile from "../components/AccountProfile.ce.vue";
import CoachingControls from "../components/CoachingControls.ce.vue";
import DemoRecruiterBanner from "../components/DemoRecruiterBanner.vue";
import GameHistory from "../components/GameHistory.ce.vue";
import GameReviews from "../components/GameReviews.vue";
import GlobalCoaching from "../components/GlobalCoaching.ce.vue";
import JobBanner from "../components/JobBanner.ce.vue";
import ShapProfile from "../components/ShapProfile.ce.vue";
import { useIngestSync } from "../ingest-sync";

type Tab = "history" | "coaching" | "shap";
type CoachingView = "overall" | "games";
type Outcome = "loss" | "win" | "overall";
interface Job { type: "coach" | "game-coach"; status: "running" | "done" | "error"; progress?: string; error?: string; matchId?: string; notice?: string }

const props = defineProps<{ slug: string }>();
const route = useRoute();
const router = useRouter();
const reviewQuery = typeof route.query.review === "string" ? route.query.review : null;
const tab = ref<Tab>(reviewQuery ? "coaching" : (["history", "coaching", "shap"].includes(String(route.query.tab)) ? route.query.tab as Tab : "history"));
const coachingView = ref<CoachingView>(reviewQuery ? "games" : (route.query.view === "games" ? "games" : "overall"));
const pendingReviewId = ref<string | null>(reviewQuery);
const authenticated = ref(Boolean(authToken));
const ownerView = ref(ownerViewFromQuery());
const games = ref<any[]>([]);
const total = ref(0);
const predictedRank = ref<PredictedRank | null>(null);
const job = ref<Job | null>(null);
const scope = ref("adc");
const outcome = ref<Outcome>("loss");
const target = ref("challenger");
const reviews = ref<any[]>([]);
const review = ref<any | null>(null);
const gameReviews = ref<GameReview[]>([]);
const gameReviewsPage = ref(1);
const gameReviewsCount = ref(0);
const reviewsLoading = ref(true);
const coachingContext = ref<any | null>(null);
const scopeTouched = ref(false);
const evalRevision = ref(0);
let reviewsInFlight = false;

const reloadToken = ref(0);
// Un seul état de rafraîchissement pour toute la page : le bouton du hero et
// celui de l'onglet SHAP déclenchent le même job, le même cooldown (spec §6.5).
const sync = useIngestSync(computed(() => props.slug), {
  onDone: () => {
    reloadToken.value += 1;
    void Promise.all([loadReviews(), loadCoachingContext()]);
  },
});

function ownerViewFromQuery(): boolean {
  const asked = typeof route.query.admin === "string" ? route.query.admin : null;
  try {
    if (asked === "1") { localStorage.setItem("coachlol:owner", "1"); return true; }
    if (asked === "0") { localStorage.removeItem("coachlol:owner"); return false; }
    return localStorage.getItem("coachlol:owner") === "1";
  } catch { return asked === "1"; }
}

async function api(path: string): Promise<any> {
  const response = await fetch(path, { headers: withAuthHeaders() });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function onAuthChange(event: Event): void {
  authenticated.value = Boolean((event as CustomEvent).detail?.authenticated);
}

function syncGamesPage(page: any): void {
  games.value = Array.isArray(page?.items) ? page.items : [];
  total.value = Number(page?.total) || 0;
}

function findMatchingReview(): any | null {
  const normalized = scope.value.toLowerCase();
  return reviews.value.find(item =>
    String(item.scope || item.payload?.meta?.scope || "").toLowerCase() === normalized &&
    (outcome.value === "overall" || item.outcome_focus === outcome.value)
  ) || null;
}

async function loadCoachingContext(): Promise<void> {
  try {
    coachingContext.value = await api(`/api/c/${encodeURIComponent(props.slug)}/coaching-context`);
    if (!scopeTouched.value && coachingContext.value?.default_scope) {
      scope.value = coachingContext.value.default_scope;
      review.value = findMatchingReview();
    }
  } catch { coachingContext.value = null; }
}

async function saveRecentAccount(): Promise<void> {
  try {
    const account = await api(`/api/c/${encodeURIComponent(props.slug)}/account`);
    rememberRecentAccount(account);
    window.dispatchEvent(new CustomEvent(RECENT_ACCOUNTS_CHANGED));
  } catch {
    // Une URL inconnue ne doit pas entrer dans l'historique du navigateur.
  }
}

async function loadReviews(): Promise<void> {
  if (reviewsInFlight) return;
  reviewsInFlight = true; reviewsLoading.value = true;
  try {
    const [aggregatePage, gamePage] = await Promise.all([
      api(`/api/c/${encodeURIComponent(props.slug)}/reviews?kind=aggregate&page=1&size=20`),
      api(`/api/c/${encodeURIComponent(props.slug)}/reviews?kind=game&page=1&size=20`),
    ]);
    reviews.value = aggregatePage.items || [];
    review.value = findMatchingReview();
    gameReviews.value = gamePage.items || [];
    gameReviewsPage.value = gamePage.page || 1;
    gameReviewsCount.value = gamePage.total || 0;
  } catch { reviews.value = []; gameReviews.value = []; }
  finally { reviewsLoading.value = false; reviewsInFlight = false; }
}

const dynamicScopes = computed(() => {
  if (coachingContext.value?.scopes?.length) return coachingContext.value.scopes;
  const list: any[] = [{ id: "all", label: "All", rawLabel: "All" }, { id: "adc", label: "ADC", rawLabel: "ADC" }];
  const counts: Record<string, number> = {};
  for (const game of games.value) if (game?.champion) counts[game.champion] = (counts[game.champion] || 0) + 1;
  for (const item of gameReviews.value) {
    const champion = gameChampion(item);
    if (champion !== "Analyzed game") counts[champion] = (counts[champion] || 0) + 1;
  }
  Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3).forEach((champion, index) => {
    const id = champion.toLowerCase();
    if (!list.some(item => item.id === id)) list.push({ id, label: `${index === 0 && counts[champion] >= 2 ? "⭐ " : ""}${champion} (${counts[champion]})`, rawLabel: champion });
  });
  if (!list.some(item => item.id === scope.value.toLowerCase())) list.push({ id: scope.value.toLowerCase(), label: titleCase(scope.value), rawLabel: titleCase(scope.value) });
  return list;
});

const scopeLabel = computed(() => dynamicScopes.value.find((item: any) => item.id === scope.value.toLowerCase())?.rawLabel || titleCase(scope.value));
const coachBusy = computed(() => job.value?.status === "running");

function setTab(value: Tab): void { tab.value = value; void updateQuery(); }
function setCoachingView(value: CoachingView): void { coachingView.value = value; void updateQuery(); }
function setScope(value: string): void { scopeTouched.value = true; scope.value = value; review.value = findMatchingReview(); }
function setOutcome(value: Outcome): void { outcome.value = value; review.value = findMatchingReview(); }
function selectGlobalReview(value: any): void {
  review.value = value;
  if (value?.scope) scope.value = value.scope.toLowerCase();
  if (value?.outcome_focus) outcome.value = value.outcome_focus;
}

async function updateQuery(): Promise<void> {
  const query: Record<string, string> = {};
  if (tab.value !== "history") query.tab = tab.value;
  if (tab.value === "coaching" && coachingView.value !== "overall") query.view = coachingView.value;
  if (pendingReviewId.value && tab.value === "coaching" && coachingView.value === "games") query.review = pendingReviewId.value;
  await router.replace({ query });
}

function syncGameReviews(payload: { items: GameReview[]; total: number; page: number }): void {
  gameReviews.value = payload.items; gameReviewsCount.value = payload.total; gameReviewsPage.value = payload.page;
}

function coachError(error: unknown): string {
  const raw = String((error as Error)?.message || error || "");
  if (/401|authentification|authentication|non autoris|unauthoriz/i.test(raw)) return "Sign-in required: the coach password is needed for AI generation.";
  if (/429/.test(raw)) return "The model is temporarily rate-limited. Wait a few minutes before trying again.";
  return raw || "Coaching could not be generated. Try again in a moment.";
}

async function consumeSse(response: Response, onEvent: (event: string, data: any) => void): Promise<void> {
  if (!response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1], raw = /^data: (.+)$/m.exec(frame)?.[1];
      if (event && raw) onEvent(event, JSON.parse(raw));
    }
  }
}

async function generateGlobal(): Promise<void> {
  if (!authToken) { openCoachAuth(() => void generateGlobal()); return; }
  job.value = { type: "coach", status: "running" };
  try {
    const response = await fetch("/api/coach", { method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ slug: props.slug, scope: scope.value, outcome: outcome.value, target: target.value }) });
    if (response.status === 401) { setStoredAuthToken(null); window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } })); openCoachAuth(() => void generateGlobal()); throw new Error("HTTP 401"); }
    if (!response.ok) throw new Error(response.status === 409 ? "An analysis is already in progress." : `HTTP ${response.status}`);
    await consumeSse(response, (event, data) => {
      if (event === "payload") job.value = { type: "coach", status: "running", progress: "payload ready" };
      else if (event === "llm") job.value = { type: "coach", status: "running", progress: "LLM generation…" };
      else if (event === "review") job.value = { type: "coach", status: "done" };
      else if (event === "error") throw new Error(data.error);
    });
    await Promise.all([loadReviews(), loadCoachingContext()]);
  } catch (error) { job.value = { type: "coach", status: "error", error: coachError(error) }; }
}

async function generateGame(game: any, force = false): Promise<void> {
  if (!game?.match_id || coachBusy.value) return;
  if (!authToken) { openCoachAuth(() => void generateGame(game, force)); return; }
  const matchId = game.match_id;
  job.value = { type: "game-coach", matchId, status: "running", progress: "reading game journal…" };
  try {
    const response = await fetch("/api/coach/game", { method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ slug: props.slug, match_id: matchId, force }) });
    if (response.status === 401) { setStoredAuthToken(null); window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } })); openCoachAuth(() => void generateGame(game, force)); throw new Error("HTTP 401"); }
    if (!response.ok) throw new Error(response.status === 409 ? "An analysis is already in progress." : `HTTP ${response.status}`);
    let completed = false;
    await consumeSse(response, (event, data) => {
      if (event === "payload") job.value = { type: "game-coach", matchId, status: "running", progress: "journal ready" };
      else if (event === "llm") job.value = { type: "game-coach", matchId, status: "running", progress: "LLM generation…" };
      else if (event === "review") completed = true;
      else if (event === "error") throw new Error(data.error);
    });
    if (!completed) throw new Error("The stream ended before the analysis was received.");
    job.value = { type: "game-coach", matchId, status: "done" };
    await Promise.all([loadReviews(), loadCoachingContext()]);
    goToGameReview(matchId);
  } catch (error) { job.value = { type: "game-coach", matchId, status: "error", error: coachError(error) }; }
}

function hasReview(matchId: string): boolean {
  const status = coachingContext.value?.matches?.[matchId]?.review_status;
  return status ? status === "ready" || status === "stale" : gameReviews.value.some(item => gameMatchId(item) === matchId);
}

function gameCoachAction(game: any): void {
  const status = coachingContext.value?.matches?.[game?.match_id]?.review_status;
  if (status === "ready") goToGameReview(game.match_id);
  else void generateGame(game, status === "stale");
}

function goToGameReview(matchId: string): void {
  pendingReviewId.value = matchId; tab.value = "coaching"; coachingView.value = "games"; void updateQuery();
}

function selectGameTarget(matchId: string): void { pendingReviewId.value = matchId; void updateQuery(); }

const isDemoAccount = computed(() => props.slug.toLowerCase() === "spadzze");

function onDemoSelectView(newTab: Tab, newCoachingView?: CoachingView, matchId?: string): void {
  tab.value = newTab;
  if (newCoachingView) {
    coachingView.value = newCoachingView;
  }
  if (matchId) {
    pendingReviewId.value = matchId;
  }
  void updateQuery();
}

onMounted(() => {
  window.addEventListener("coach-auth-change", onAuthChange);
  void Promise.all([loadReviews(), loadCoachingContext(), saveRecentAccount()]);
});
onBeforeUnmount(() => window.removeEventListener("coach-auth-change", onAuthChange));
</script>

<template>
  <div class="account-page-container">
    <!-- Toile d'ambiance Targon en filigrane pour la page joueur -->
    <div class="account-targon-backdrop" aria-hidden="true">
      <div class="account-stone-layer"></div>
      <div class="account-sanctuary-layer"></div>
    </div>

    <!-- Artefacts célestes et gardiens le long de la page joueur (alternance gauche-droite) -->
    <div class="account-side-artefacts page-side-artefacts" aria-hidden="true">
      <div class="side-artefact-item account-artefact--arme"></div>
      <div class="side-artefact-item account-artefact--solaris"></div>
      <div class="side-artefact-item account-artefact--bolor"></div>
      <div class="side-artefact-item account-artefact--lunaris"></div>
    </div>

    <DemoRecruiterBanner
      v-if="isDemoAccount"
      :current-tab="tab"
      :current-coaching-view="coachingView"
      :target-match-id="pendingReviewId"
      @select-view="onDemoSelectView"
    />
    <AccountProfile
      :slug="slug"
      :total="total"
      :sync="sync"
      :reload-token="reloadToken"
      @prediction-loaded="predictedRank = $event"
      @open-shap="setTab('shap')"
    />
    <details v-if="ownerView" class="sync-help"><summary>Update my data</summary><p>Run <code>poetry run python src/collection/refresh_cloudflare.py</code> from your terminal. New games will then be published to this site automatically.</p></details>
    <JobBanner :job="job" />

    <!-- Séparateur céleste Targon -->
    <div class="celestial-divider" aria-hidden="true">
      <span class="divider-line"></span>
      <span class="divider-gem">✦</span>
      <span class="divider-line"></span>
    </div>

    <div class="tabs" role="tablist" aria-label="Account sections">
      <button
        v-for="item in ([['history', 'Ranked games'], ['shap', 'ML & SHAP profile'], ['coaching', 'AI coaching']] as const)"
        :key="item[0]"
        type="button"
        class="tab"
        :class="{ active: tab === item[0] }"
        :aria-selected="tab === item[0]"
        @click="setTab(item[0])"
      >
        {{ item[1] }}
      </button>
    </div>
    <GameHistory v-if="tab === 'history'" :slug="slug" :game-reviews="gameReviews" :coaching-context="coachingContext" :job="job" :predicted-rank="predictedRank" :authenticated="authenticated" @games-loaded="syncGamesPage" @coach-game="gameCoachAction" @regenerate-game="game => generateGame(game, true)" />
    <ShapProfile v-else-if="tab === 'shap'" :slug="slug" :sync="sync" :reload-token="reloadToken" />
    <div v-else-if="tab === 'coaching'">
      <CoachingControls :slug="slug" :view="coachingView" :game-reviews-count="gameReviewsCount" :scopes="dynamicScopes" :scope="scope" :outcome="outcome" :authenticated="authenticated" :busy="coachBusy" :eval-revision="evalRevision" @view-change="setCoachingView" @scope-change="setScope" @outcome-change="setOutcome" @generate="generateGlobal" />
      <GlobalCoaching v-if="coachingView === 'overall'" :slug="slug" :review="review" :reviews="reviews" :loading="reviewsLoading" :scope="scope" :scope-name="scopeLabel" :outcome="outcome" :authenticated="authenticated" :busy="coachBusy" :coaching-context="coachingContext" @generate="generateGlobal" @review-select="selectGlobalReview" @feedback-saved="evalRevision += 1" />
      <GameReviews v-else :slug="slug" :reviews="gameReviews" :total="gameReviewsCount" :page="gameReviewsPage" :loading="reviewsLoading" :authenticated="authenticated" :target-match-id="pendingReviewId" @reviews-loaded="syncGameReviews" @review-select="selectGameTarget" @feedback-saved="evalRevision += 1" />
    </div>
  </div>
</template>

<style scoped>
.account-page-container {
  position: relative;
  width: 100%;
  isolation: isolate;
}

/* Tous les contenus interactifs et cartes passent STRICTEMENT AU-DESSUS des ornements */
.account-page-container > *:not(.account-side-artefacts):not(.account-targon-backdrop) {
  position: relative;
  z-index: 2;
}

/* Toile d'ambiance Targon en filigrane pour la page joueur */
.account-targon-backdrop {
  position: absolute;
  top: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  height: 480px;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  mask-image: radial-gradient(ellipse 85% 65% at 50% 20%, black 25%, transparent 85%),
              linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 85% 65% at 50% 20%, black 25%, transparent 85%),
                      linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

.account-stone-layer {
  position: absolute;
  inset: 0;
  background: url('/images/targon/grave-dans-la-pierre.jpg') center 20% / cover no-repeat;
  opacity: 0.12;
  mix-blend-mode: multiply;
  filter: contrast(1.2) sepia(0.2);
}

.account-sanctuary-layer {
  position: absolute;
  inset: 0;
  background: url('/images/targon/sanctuaire-solaris.jpg') center 25% / cover no-repeat;
  opacity: 0.16;
  mix-blend-mode: multiply;
  filter: contrast(1.15) saturate(1.1);
}

/* Artefacts sacrés sur les flancs de la page joueur (en arrière-plan strict) */
.account-side-artefacts {
  top: 140px;
  z-index: 0;
}

/* 1. Haut GAUCHE : Lame sacrée */
.account-artefact--arme {
  top: 40px;
  left: max(10px, calc(50% - 730px));
  width: 330px;
  height: 330px;
  background: url('/images/targon/arme-interdite.jpg') center / contain no-repeat;
  opacity: 0.13;
  mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  filter: contrast(1.15) drop-shadow(0 0 30px rgba(120, 32, 37, 0.22));
}

/* 2. Milieu-Haut DROITE : Guerrier Solaris */
.account-artefact--solaris {
  top: 560px;
  right: max(10px, calc(50% - 730px));
  width: 340px;
  height: 420px;
  background: url('/images/targon/solaris.jpg') center / contain no-repeat;
  opacity: 0.13;
  mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  filter: contrast(1.15) drop-shadow(0 0 30px rgba(185, 143, 83, 0.25));
}

/* 3. Milieu-Bas GAUCHE : Créature gardienne (Bolor) */
.account-artefact--bolor {
  top: 1160px;
  left: max(10px, calc(50% - 730px));
  width: 350px;
  height: 350px;
  background: url('/images/targon/bolor.jpg') center / contain no-repeat;
  opacity: 0.12;
  mask-image: radial-gradient(circle at center, black 24%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle at center, black 24%, transparent 72%);
  filter: contrast(1.12) drop-shadow(0 0 25px rgba(126, 97, 52, 0.18));
}

/* 4. Bas DROITE : Prêtresse Lunaris (réutilisée de la méthodologie) */
.account-artefact--lunaris {
  top: 1720px;
  right: max(10px, calc(50% - 730px));
  width: 340px;
  height: 420px;
  background: url('/images/targon/lunaris.jpg') center / contain no-repeat;
  opacity: 0.13;
  mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  -webkit-mask-image: radial-gradient(circle at center, black 22%, transparent 72%);
  filter: contrast(1.15) drop-shadow(0 0 30px rgba(62, 109, 140, 0.25));
}

@media (max-width: 1200px) {
  .account-artefact--arme { opacity: 0.08; left: -30px; }
  .account-artefact--solaris { opacity: 0.08; right: -30px; }
  .account-artefact--bolor { opacity: 0.08; left: -30px; }
  .account-artefact--lunaris { opacity: 0.08; right: -30px; }
}

.sync-help {
  margin: 0 0 24px;
  padding: 0 16px;
  color: var(--text-dim);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
}

.sync-help summary {
  padding: 10px 0;
  color: var(--text-dim);
  cursor: pointer;
  font-weight: 600;
}

.sync-help p {
  margin: 0 0 12px;
  line-height: 1.6;
}

.sync-help code {
  color: var(--gold-deep);
  font-size: 12px;
}
</style>
