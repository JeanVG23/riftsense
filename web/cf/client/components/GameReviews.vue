<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { formatDate } from "../account-profile";
import { authToken, openCoachAuth, setStoredAuthToken, withAuthHeaders } from "../auth";
import { insightBody, insightTitle } from "../coaching";
import {
  gameChampion, gameDuration, gameIcon, gameKda, gameMatchId, gameMeta,
  gameOpponent, gamePatch, gameResult, iconFallback, type GameReview,
} from "../game-review";
import FeedbackButtons from "./FeedbackButtons.vue";

interface FeedbackValue { useful: boolean; tag?: string | null; note?: string | null }
interface ChatMessage { role: "user" | "assistant"; content: string }

const props = withDefaults(defineProps<{
  slug: string;
  reviews?: GameReview[];
  total?: number;
  page?: number;
  loading?: boolean;
  authenticated?: boolean;
  targetMatchId?: string | null;
}>(), {
  reviews: () => [], total: 0, page: 1, loading: false,
  authenticated: false, targetMatchId: null,
});

const emit = defineEmits<{
  "reviews-loaded": [payload: { items: GameReview[]; total: number; page: number }];
  "feedback-saved": [];
  "review-select": [matchId: string];
}>();

const items = ref<GameReview[]>([]);
const currentPage = ref(1);
const filterResult = ref<"all" | "win" | "loss">("all");
const filterChampion = ref("all");
const selected = ref<GameReview | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);
const loadingMore = ref(false);
const feedback = ref<Record<string, FeedbackValue>>({});
const feedbackBusy = ref<Record<string, boolean>>({});
const openFeedback = ref<string | null>(null);
const openNotes = ref<Record<string, boolean>>({});
const noteDraft = ref<Record<string, string>>({});
const feedbackError = ref<string | null>(null);
const chatMessages = ref<ChatMessage[]>([]);
const chatDraft = ref("");
const chatBusy = ref(false);
const chatError = ref<string | null>(null);
let selectionSequence = 0;
let feedbackSequence = 0;
let resolvingTarget: string | null = null;

const filtered = computed(() => items.value.filter((item) => {
  const win = gameMeta(item).win;
  if (filterResult.value === "win" && win !== true) return false;
  if (filterResult.value === "loss" && win !== false) return false;
  return filterChampion.value === "all" || gameChampion(item).toLowerCase() === filterChampion.value.toLowerCase();
}));
const wins = computed(() => items.value.filter(item => gameMeta(item).win === true).length);
const losses = computed(() => items.value.filter(item => gameMeta(item).win === false).length);
const champions = computed(() => [...new Set(items.value.map(gameChampion).filter(item => item !== "Partie analysée"))].sort());

function feedbackKey(kind: string, index: number): string { return `${kind},${index}`; }
function feedbackState(kind: string, index: number): FeedbackValue | null { return feedback.value[feedbackKey(kind, index)] || null; }

async function fetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(path, { ...options, headers: withAuthHeaders(options.headers) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadFeedback(review: GameReview): Promise<void> {
  const sequence = ++feedbackSequence;
  feedback.value = {}; noteDraft.value = {}; openFeedback.value = null; openNotes.value = {}; feedbackError.value = null;
  try {
    const list = await fetchJson(`/api/c/${encodeURIComponent(props.slug)}/feedback`);
    const current = list.find((item: any) => item.ts === review.ts);
    const next: Record<string, FeedbackValue> = {};
    const notes: Record<string, string> = {};
    for (const item of current?.items || []) {
      const key = feedbackKey(item.kind, item.index);
      next[key] = { useful: item.useful, tag: item.tag, note: item.note };
      notes[key] = item.note || "";
    }
    if (sequence === feedbackSequence) { feedback.value = next; noteDraft.value = notes; }
  } catch { /* La review reste lisible sans annotations. */ }
}

async function selectReview(review: GameReview): Promise<void> {
  if (!review?.ts) return;
  const sequence = ++selectionSequence;
  detailLoading.value = true; detailError.value = null;
  chatMessages.value = []; chatDraft.value = ""; chatError.value = null;
  try {
    const detail = await fetchJson(`/api/c/${encodeURIComponent(props.slug)}/reviews/${encodeURIComponent(review.ts)}`);
    if (sequence !== selectionSequence) return;
    selected.value = detail;
    await loadFeedback(detail);
  } catch {
    if (sequence === selectionSequence) detailError.value = "Impossible de charger cette analyse. Réessaie dans un instant.";
  } finally {
    if (sequence === selectionSequence) detailLoading.value = false;
  }
}

async function selectUserReview(review: GameReview): Promise<void> {
  await selectReview(review);
  if (selected.value?.ts === review.ts) emit("review-select", gameMatchId(review));
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || items.value.length >= props.total) return;
  loadingMore.value = true;
  try {
    const next = await fetchJson(`/api/c/${encodeURIComponent(props.slug)}/reviews?kind=game&page=${currentPage.value + 1}&size=20`);
    items.value = [...items.value, ...(next.items || [])];
    currentPage.value = next.page || currentPage.value;
    emit("reviews-loaded", { items: items.value, total: next.total || props.total, page: currentPage.value });
  } finally { loadingMore.value = false; }
}

async function resolveTarget(matchId: string): Promise<void> {
  if (resolvingTarget === matchId) return;
  resolvingTarget = matchId;
  let target = items.value.find(item => gameMatchId(item) === matchId);
  try {
    while (!target && items.value.length < props.total) {
      const before = items.value.length;
      await loadMore();
      if (items.value.length === before) break;
      target = items.value.find(item => gameMatchId(item) === matchId);
    }
    await selectReview(target || filtered.value[0] || items.value[0]);
    await nextTick();
    document.querySelector(".game-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    resolvingTarget = null;
  }
}

function applyFilter(): void {
  if (filtered.value.length && !filtered.value.some(item => item.ts === selected.value?.ts)) void selectReview(filtered.value[0]);
}

async function submitFeedback(kind: string, index: number, useful: boolean, tag: string | null = null, note?: string | null): Promise<void> {
  if (!selected.value) return;
  const key = feedbackKey(kind, index);
  if (!useful && !tag) { openFeedback.value = key; return; }
  const previous = feedback.value[key];
  const entry: FeedbackValue = { useful, ...(tag ? { tag } : {}), ...(note !== undefined ? { note } : previous?.note ? { note: previous.note } : {}) };
  const next = { ...feedback.value, [key]: entry };
  feedbackBusy.value = { ...feedbackBusy.value, [key]: true };
  feedbackError.value = null;
  try {
    await fetchJson("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: props.slug, ts: selected.value.ts, responses: next }),
    });
    feedback.value = next; openFeedback.value = null; emit("feedback-saved");
  } catch (error) {
    feedbackError.value = /429/.test(String(error)) ? "Trop de votes en peu de temps. Réessaie dans une heure." : "Le vote n’a pas été enregistré. Réessaie dans un instant.";
  } finally { feedbackBusy.value = { ...feedbackBusy.value, [key]: false }; }
}

function toggleNote(kind: string, index: number): void {
  const key = feedbackKey(kind, index);
  openNotes.value = { ...openNotes.value, [key]: !openNotes.value[key] };
}

async function saveNote(kind: string, index: number): Promise<void> {
  const key = feedbackKey(kind, index);
  const state = feedback.value[key];
  if (state) await submitFeedback(kind, index, state.useful, state.tag || null, noteDraft.value[key]?.trim() || null);
}

function coachError(error: unknown): string {
  const raw = String((error as Error)?.message || error || "");
  if (/401|authentification|non autoris/i.test(raw)) return "Connexion requise : mot de passe coach nécessaire.";
  if (/429/.test(raw)) return "Le modèle est temporairement limité. Réessaie dans quelques minutes.";
  return raw || "Le coach n’a pas pu répondre.";
}

async function sendChat(): Promise<void> {
  const content = chatDraft.value.trim();
  if (!content || !selected.value?.ts || chatBusy.value) return;
  if (!authToken) { openCoachAuth(() => void sendChat()); return; }
  const pending: ChatMessage[] = [...chatMessages.value, { role: "user", content }];
  chatMessages.value = pending; chatDraft.value = ""; chatBusy.value = true; chatError.value = null;
  try {
    const response = await fetch("/api/chat", {
      method: "POST", headers: withAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ slug: props.slug, review_ts: selected.value.ts, messages: pending.slice(-12) }),
    });
    if (response.status === 401) {
      setStoredAuthToken(null);
      window.dispatchEvent(new CustomEvent("coach-auth-change", { detail: { authenticated: false } }));
      openCoachAuth(() => void sendChat());
    }
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1], raw = /^data: (.+)$/m.exec(frame)?.[1];
        if (!event || !raw) continue;
        const data = JSON.parse(raw);
        if (event === "message") chatMessages.value = [...chatMessages.value, { role: "assistant", content: data.answer }];
        else if (event === "error") throw new Error(data.error);
      }
    }
  } catch (error) { chatError.value = coachError(error); }
  finally { chatBusy.value = false; }
}

watch(() => [props.slug, props.reviews] as const, () => {
  items.value = [...props.reviews]; currentPage.value = props.page;
  if (props.targetMatchId && gameMatchId(selected.value) !== props.targetMatchId) void resolveTarget(props.targetMatchId);
  else if (!selected.value && items.value.length) void selectReview(filtered.value[0] || items.value[0]);
}, { immediate: true, deep: true });
watch(() => props.targetMatchId, value => { if (value && gameMatchId(selected.value) !== value) void resolveTarget(value); });
watch([filterResult, filterChampion], applyFilter);
</script>

<template>
  <section class="game-reviews" aria-labelledby="game-reviews-title">
    <div class="game-reviews-heading"><div><p class="eyebrow">ANALYSES DÉTAILLÉES</p><h2 id="game-reviews-title">Revoir une partie, moment par moment</h2><p>Chaque analyse dissèque une partie précise : morts, retours en base, timing d'objectifs et focus pour ta prochaine game.</p></div></div>
    <div class="review-primer"><strong>Comment cette analyse est construite</strong><span>La timeline de l’API Riot est transformée localement en journal vérifiable ; l’IA ne reçoit que ce journal nettoyé et ne relit jamais le brouillard de guerre.</span></div>
    <div class="game-privacy-banner"><span class="privacy-icon">🛡️</span><span><strong>Analyse intègre :</strong> reconstruite depuis la timeline Riot avec respect strict de l'asymétrie d'information.</span></div>
    <div v-if="loading" class="state">Chargement des analyses de parties…</div>
    <div v-else-if="!items.length" class="state empty-state"><strong>Aucune analyse de partie disponible.</strong><span>Les prochaines analyses individuelles apparaîtront ici.</span></div>
    <div v-else class="game-review-layout">
      <div class="game-review-sidebar">
        <div class="game-filter-bar">
          <div class="segmented-choice filter-segmented" role="group" aria-label="Filtrer par résultat">
            <button type="button" :class="{ selected: filterResult === 'all' }" @click="filterResult = 'all'">Toutes ({{ items.length }})</button>
            <button type="button" :class="{ selected: filterResult === 'win', 'win-choice': filterResult === 'win' }" @click="filterResult = 'win'">Victoires ({{ wins }})</button>
            <button type="button" :class="{ selected: filterResult === 'loss', 'loss-choice': filterResult === 'loss' }" @click="filterResult = 'loss'">Défaites ({{ losses }})</button>
          </div>
          <select v-if="champions.length > 1" v-model="filterChampion" class="champ-filter-select"><option value="all">Tous les champions</option><option v-for="champion in champions" :key="champion" :value="champion">{{ champion }}</option></select>
        </div>
        <nav class="game-review-list" aria-label="Analyses de parties disponibles">
          <button v-for="item in filtered" :key="item.ts" type="button" class="game-review-option" :class="[selected?.ts === item.ts ? 'selected' : '', gameResult(item) === 'Victoire' ? 'is-win' : 'is-loss']" :aria-current="selected?.ts === item.ts" @click="selectUserReview(item)">
            <img class="game-option-icon" :src="gameIcon(item)" :alt="gameChampion(item)" loading="lazy" @error="iconFallback($event, gameChampion(item))">
            <span class="game-option-copy"><span class="game-option-top"><strong>{{ gameChampion(item) }}</strong><span class="game-mini-badge" :class="gameResult(item) === 'Victoire' ? 'win' : 'loss'">{{ gameResult(item) }}</span></span><span class="game-option-sub"><span v-if="gameKda(item)">{{ gameKda(item) }} · </span><span v-if="gameOpponent(item)">vs {{ gameOpponent(item) }} · </span>{{ formatDate(item.ts) }}</span></span><span class="game-option-arrow">→</span>
          </button>
          <div v-if="!filtered.length" class="state empty-state-compact">Aucune partie pour ce filtre.</div>
          <button v-if="items.length < total" type="button" class="game-load-more" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? "Chargement…" : "Afficher plus de parties" }}</button>
        </nav>
      </div>
      <div v-if="detailLoading" class="state game-detail-state">Chargement de l’analyse…</div>
      <div v-else-if="detailError" class="state err game-detail-state">{{ detailError }}</div>
      <article v-else-if="selected?.review" class="game-review-detail">
        <header class="game-detail-header"><div class="game-detail-title"><img class="game-detail-icon" :src="gameIcon(selected)" :alt="gameChampion(selected)" @error="iconFallback($event, gameChampion(selected))"><div><p class="eyebrow">ANALYSE DE PARTIE</p><h3>{{ gameChampion(selected) }}<span v-if="gameOpponent(selected)"> · contre {{ gameOpponent(selected) }}</span></h3><p class="game-match-id">{{ gameMatchId(selected) }}</p></div></div><span class="game-result" :class="gameResult(selected) === 'Victoire' ? 'win' : 'loss'">{{ gameResult(selected) }}</span></header>
        <div class="game-detail-stats"><span v-if="gameKda(selected)"><small>KDA</small><strong>{{ gameKda(selected) }}</strong></span><span v-if="gameDuration(selected)"><small>Durée</small><strong>{{ gameDuration(selected) }}</strong></span><span v-if="gamePatch(selected)"><small>Patch</small><strong>{{ gamePatch(selected) }}</strong></span><span><small>Confiance</small><strong>{{ Math.round((selected.review.confidence || 0) * 100) }}%</strong></span></div>
        <section v-if="selected.review.summary" class="game-chief-summary"><span>Synthèse du coach</span><p>{{ selected.review.summary }}</p></section>
        <section v-if="selected.review.axes?.length" class="game-axis-list" aria-label="Analyses spécialisées"><details v-for="axis in selected.review.axes" :key="axis.axis" class="game-axis"><summary><span>{{ axis.label }}</span><small>{{ axis.strengths.length }} force(s) · {{ axis.mistakes.length }} erreur(s)</small></summary><div class="game-axis-body"><article v-for="(item, index) in [...axis.strengths, ...axis.mistakes]" :key="`${axis.axis}-${index}`"><strong>{{ item.point }}</strong><p>{{ item.cause }}</p><span>{{ item.evidence }}</span></article></div></details></section>
        <section class="game-focus-card"><span class="game-focus-label">Focus pour ta prochaine partie</span><p class="game-focus-text">{{ selected.review.next_focus }}</p><FeedbackButtons kind="focus" :index="0" :state="feedbackState('focus', 0)" :busy="feedbackBusy['focus,0']" :open-key="openFeedback" prompt @vote="submitFeedback" @tag="(kind, index, tag) => submitFeedback(kind, index, false, tag)" /></section>
        <div class="game-insight-grid">
          <section class="game-insight-section strengths"><div class="col-head"><span class="col-icon">🛡️</span><h3>Ce qui a bien fonctionné</h3></div><p v-if="!selected.review.strengths?.length" class="game-empty-copy">Aucune force suffisamment nette n’a été retenue pour cette partie.</p><article v-for="(item, index) in selected.review.strengths || []" :key="`strength-${index}`" class="game-insight-item"><h4 class="insight-title">{{ insightTitle(item.point) }}</h4><p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p><details v-if="item.cause" class="cause-details"><summary>Pourquoi ?</summary><span>{{ item.cause }}</span></details><div class="insight-card-footer"><span class="evidence-chip kind-strength">{{ item.evidence }}</span><FeedbackButtons kind="strength" :index="index" :state="feedbackState('strength', index)" :busy="feedbackBusy[feedbackKey('strength', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" /></div></article></section>
          <section class="game-insight-section mistakes"><div class="col-head"><span class="col-icon">⚠️</span><h3>Erreurs à retenir</h3></div><article v-for="(item, index) in selected.review.mistakes || []" :key="`mistake-${index}`" class="game-insight-item"><h4 class="insight-title">{{ insightTitle(item.point) }}</h4><p v-if="insightBody(item.point)" class="insight-body">{{ insightBody(item.point) }}</p><details v-if="item.cause" class="cause-details" open><summary>Pourquoi ?</summary><span>{{ item.cause }}</span></details><div class="insight-card-footer"><span class="evidence-chip kind-mistake">{{ item.evidence }}</span><div><FeedbackButtons kind="mistake" :index="index" :state="feedbackState('mistake', index)" :busy="feedbackBusy[feedbackKey('mistake', index)]" :open-key="openFeedback" @vote="submitFeedback" @tag="(kind, itemIndex, tag) => submitFeedback(kind, itemIndex, false, tag)" /><button v-if="feedbackState('mistake', index)" type="button" class="fb-btn-compact" title="Ajouter une note" @click="toggleNote('mistake', index)">✎</button><div v-if="openNotes[feedbackKey('mistake', index)]" class="fb-note-editor"><textarea v-model="noteDraft[feedbackKey('mistake', index)]" class="fb-note-input" rows="3" maxlength="500" placeholder="Précise ce qui t’aide ou ce qui manque…"></textarea><button type="button" class="btn btn-small" :disabled="feedbackBusy[feedbackKey('mistake', index)]" @click="saveNote('mistake', index)">Enregistrer la note</button></div></div></div></article></section>
        </div>
        <section class="game-chat" aria-labelledby="game-chat-title"><div class="game-chat-heading"><div><span class="game-focus-label">COACH INTERACTIF</span><h3 id="game-chat-title">Conteste, explique ou approfondis.</h3></div><small>Le coach refuse les informations ennemies cachées.</small></div><div v-if="chatMessages.length" class="game-chat-log"><p v-for="(message, index) in chatMessages" :key="index" :class="message.role">{{ message.content }}</p></div><form class="game-chat-form" @submit.prevent="sendChat"><label class="sr-only" for="game-chat-input">Question au coach</label><textarea id="game-chat-input" v-model="chatDraft" rows="2" maxlength="2000" :placeholder="authenticated ? 'Ex. : ce choix était-il vraiment mauvais ?' : '🔒 Connexion requise pour discuter avec le coach IA…'"></textarea><button type="submit" :disabled="chatBusy || (authenticated && !chatDraft.trim())">{{ chatBusy ? "Le coach réfléchit…" : (authenticated ? "Envoyer" : "🔒 Se connecter") }}</button></form><p v-if="chatError" class="feedback-error">{{ chatError }}</p></section>
      </article>
      <p v-if="feedbackError" class="feedback-error">{{ feedbackError }}</p>
    </div>
  </section>
</template>

<style scoped>
.game-reviews {
  padding: 24px;
  background:
    linear-gradient(120deg, var(--win-soft), transparent 36%),
    var(--panel-gradient);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
}

.game-reviews-heading {
  margin: 0 0 20px;
}

.game-reviews-heading .eyebrow {
  margin-bottom: 5px;
}

.game-reviews-heading h2 {
  color: var(--text);
  font-size: 20px;
  letter-spacing: -.03em;
}

.game-reviews-heading p {
  max-width: 680px;
  margin: 5px 0 0;
  color: var(--text-dim);
  font-size: 13px;
}

.review-primer {
  display: grid;
  gap: 3px;
  margin: 0 0 12px;
  padding: 12px 14px;
  color: var(--text-dim);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
  border-radius: 9px;
  font-size: 12px;
}

.review-primer strong {
  color: var(--text);
}

.game-privacy-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin: 0 0 16px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--primary);
  border-radius: 9px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.45;
}

.privacy-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.game-review-layout {
  display: grid;
  grid-template-columns: minmax(240px, 310px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.game-review-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.game-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--panel);
  padding: 8px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.filter-segmented {
  width: 100%;
}

.filter-segmented button {
  font-size: 11px;
  padding: 4px 6px;
}

.champ-filter-select {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  outline: none;
  cursor: pointer;
}

.champ-filter-select:focus {
  border-color: var(--primary);
}

.game-review-list {
  display: flex;
  max-height: 600px;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 11px;
}

.game-review-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: var(--transition-fast);
}

.game-review-option:hover {
  color: var(--text);
  background: var(--surface-alt);
}

.game-review-option.selected {
  color: var(--text);
  background: var(--primary-soft);
  border-color: var(--primary-border);
}

.game-review-option.is-win {
  border-left: 3px solid var(--win);
}

.game-review-option.is-loss {
  border-left: 3px solid var(--loss);
}

.game-option-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.game-mini-badge {
  font-size: 9px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: .04em;
  flex-shrink: 0;
}

.game-mini-badge.win {
  color: var(--win);
  background: var(--win-soft);
  border: 1px solid var(--win-border);
}

.game-mini-badge.loss {
  color: var(--loss);
  background: var(--loss-soft);
  border: 1px solid var(--loss-border);
}

.game-option-sub {
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-faint);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state-compact {
  padding: 20px 10px;
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
}

.game-load-more {
  padding: 9px;
  color: var(--primary);
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 8px;
  cursor: pointer;
  font: 600 12px/1.3 inherit;
}

.game-load-more:hover {
  color: var(--text);
  border-color: var(--primary);
}

.game-load-more:disabled {
  opacity: .55;
  cursor: default;
}

.game-option-icon,
.game-detail-icon {
  flex: 0 0 auto;
  object-fit: cover;
  background: var(--panel);
}

.game-option-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.game-option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.game-option-copy strong {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-option-arrow {
  color: var(--primary);
  font-size: 15px;
  flex-shrink: 0;
}

.game-review-detail {
  min-width: 0;
  padding: 22px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
}

.game-detail-state {
  min-height: 220px;
  margin: 0;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
}

.game-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.game-detail-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.game-detail-icon {
  width: 48px;
  height: 48px;
  border-radius: 11px;
  box-shadow: var(--card-shadow);
}

.game-detail-title .eyebrow {
  margin-bottom: 2px;
  font-size: 9px;
}

.game-detail-title h3 {
  color: var(--text);
  font-size: 19px;
  letter-spacing: -.025em;
}

.game-match-id {
  max-width: 250px;
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--text-faint);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-result {
  flex: 0 0 auto;
  padding: 4px 10px;
  color: var(--loss);
  background: var(--loss-soft);
  border: 1px solid var(--loss-border);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 750;
}

.game-result.win {
  color: var(--win);
  background: var(--win-soft);
  border: 1px solid var(--win-border);
}

.game-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 18px 0;
  overflow: hidden;
  background: var(--border-soft);
  border: 1px solid var(--border-soft);
  border-radius: 9px;
}

.game-detail-stats > span {
  display: flex;
  flex: 1 1 100px;
  min-height: 53px;
  flex-direction: column;
  justify-content: center;
  padding: 8px 12px;
  background: var(--panel-2);
}

.game-detail-stats small {
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.game-detail-stats strong {
  margin-top: 2px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.game-focus-card {
  padding: 16px;
  margin: 0 0 18px;
  background: linear-gradient(100deg, var(--primary-soft), transparent 85%);
  border: 1px solid var(--primary-border);
  border-radius: 10px;
}

.game-focus-label {
  color: var(--primary);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.game-focus-text {
  margin: 5px 0 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.55;
}

.game-chief-summary {
  padding: 14px 16px;
  margin: 0 0 12px;
  color: var(--text);
  background: var(--win-soft);
  border: 1px solid var(--win-border);
  border-radius: 10px;
}

.game-chief-summary span {
  color: var(--win);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.game-chief-summary p {
  margin: 5px 0 0;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.5;
}

.game-axis-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 18px;
}

.game-axis {
  padding: 0 14px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.game-axis > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 0;
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.game-axis > summary small {
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 500;
}

.game-axis-body {
  padding: 0 0 12px;
}

.game-axis-body article {
  padding: 10px 0;
  border-top: 1px solid var(--border-soft);
}

.game-axis-body strong {
  display: block;
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
}

.game-axis-body p {
  margin: 5px 0;
  color: var(--text-dim);
  font-size: 11px;
  line-height: 1.45;
}

.game-axis-body span {
  color: var(--text-faint);
  font-size: 10px;
  line-height: 1.4;
}

.game-insight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.game-insight-section {
  padding: 15px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.game-insight-section h3 {
  margin-bottom: 11px;
  color: var(--text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.game-insight-section.strengths h3 { color: var(--win); }
.game-insight-section.mistakes h3 { color: var(--loss); }

.game-insight-item + .game-insight-item {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}

.game-insight-item p {
  margin: 0 0 9px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.game-insight-item details {
  margin: 0 0 9px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.game-insight-item summary {
  color: var(--text-faint);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.game-insight-item details span {
  display: block;
  padding: 7px 0 0;
}

.game-empty-copy {
  margin: 0;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.55;
}

.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.col-icon {
  font-size: 15px;
}

.insight-title {
  margin: 0 0 5px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.insight-body {
  margin: 0 0 7px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.insight-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.evidence-chip {
  display: inline-block;
  font-size: 11px;
  color: var(--text-dim);
  background: var(--panel-2);
  border-left: 3px solid var(--border);
  padding: 4px 8px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  max-width: 100%;
  line-height: 1.4;
}

.evidence-chip.kind-strength { border-left-color: var(--win); }
.evidence-chip.kind-mistake { border-left-color: var(--loss); }

.fb-note-editor {
  position: absolute;
  top: 32px;
  right: 0;
  z-index: 30;
  display: grid;
  gap: 7px;
  width: min(300px, 78vw);
  padding: 9px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-overlay);
}

.fb-note-input {
  width: 100%;
  resize: vertical;
  padding: 8px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 7px;
}

.fb-note-input:focus {
  border-color: var(--primary);
  outline: none;
}

.game-chat {
  margin-top: 18px;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}

.game-chat-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.game-chat-heading h3 {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 14px;
}

.game-chat-heading small {
  max-width: 220px;
  color: var(--text-faint);
  font-size: 10px;
  text-align: right;
}

.game-chat-log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
}

.game-chat-log p {
  max-width: 86%;
  margin: 0;
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.5;
}

.game-chat-log .user {
  align-self: flex-end;
  color: var(--text);
  background: var(--primary-soft);
  border: 1px solid var(--primary-border);
}

.game-chat-log .assistant {
  align-self: flex-start;
  color: var(--text-dim);
  background: var(--panel-2);
}

.game-chat-form {
  display: flex;
  align-items: flex-end;
  gap: 9px;
  margin-top: 14px;
}

.game-chat-form textarea {
  flex: 1;
  resize: vertical;
  padding: 10px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  font: 12px/1.45 inherit;
}

.game-chat-form button {
  min-height: 39px;
  padding: 0 14px;
  color: var(--primary-text);
  background: var(--primary-gradient);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font: 700 11px/1 inherit;
}

.game-chat-form button:disabled {
  opacity: .5;
  cursor: default;
}

.feedback-error {
  margin: 12px 0 0;
  color: var(--loss);
  font-size: 12px;
}

@media (max-width: 640px) {
  .game-axis-list {
    grid-template-columns: 1fr;
  }
  .game-chat-heading,
  .game-chat-form {
    align-items: stretch;
    flex-direction: column;
  }
  .game-chat-heading small {
    max-width: none;
    text-align: left;
  }
  .game-reviews {
    padding: 18px;
    border-radius: 14px;
  }
  .game-review-layout {
    grid-template-columns: 1fr;
  }
  .game-review-list {
    max-height: 230px;
  }
  .game-review-detail {
    padding: 16px;
  }
  .game-insight-grid {
    grid-template-columns: 1fr;
  }
}
</style>
