<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { rankEmblem, rankGlow, titleCase, type PredictedRank } from "../account-profile";
import { withAuthHeaders } from "../auth";
import {
  alliedTeam,
  championIcon,
  combatCount,
  combatEvents,
  diffClass,
  enemyTeam,
  fallbackChampionIcon,
  formatDiff,
  formatFullDate,
  formatGameDate,
  formatGold,
  formatKda,
  formatNumber,
  formatPercent,
  objectiveIcon,
  objectiveLabel,
  queueLabel,
  roleIcon,
  roleLabel,
  sideSummary,
  zoneLabel,
  type CombatFilter,
  type GameSummary,
  type GamesPage,
} from "../game-history";

interface ReviewRecord {
  match_id?: string;
  payload?: { meta?: { match_id?: string } };
  meta?: { match_id?: string };
}

interface MatchCoachInfo {
  review_status?: string;
  analyzable?: boolean;
  pedagogic?: { kind?: string; label?: string; hint?: string };
}

interface CoachingContext {
  matches?: Record<string, MatchCoachInfo>;
}

interface CoachJob {
  type?: string;
  status?: string;
  matchId?: string;
  progress?: string;
}

const props = withDefaults(defineProps<{
  slug: string;
  gameReviews?: ReviewRecord[];
  coachingContext?: CoachingContext | null;
  job?: CoachJob | null;
  predictedRank?: PredictedRank | null;
  authenticated?: boolean;
}>(), {
  gameReviews: () => [],
  coachingContext: null,
  job: null,
  predictedRank: null,
  authenticated: false,
});

const emit = defineEmits<{
  gamesLoaded: [page: GamesPage];
  coachGame: [game: GameSummary];
  regenerateGame: [game: GameSummary];
}>();

const games = ref<GameSummary[]>([]);
const page = ref(1);
const size = 20;
const total = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const expandedGameId = ref<string | null>(null);
const combatFilter = ref<CombatFilter>("all");
let requestSequence = 0;

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size)));
const coachBusy = computed(() => props.job?.status === "running");

async function loadGames(): Promise<void> {
  const sequence = ++requestSequence;
  loading.value = true;
  error.value = null;
  try {
    const response = await fetch(
      `/api/c/${encodeURIComponent(props.slug)}/games?page=${page.value}&size=${size}`,
      { headers: withAuthHeaders() },
    );
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const result = await response.json() as GamesPage;
    if (sequence !== requestSequence) return;
    games.value = Array.isArray(result.items) ? result.items : [];
    total.value = Number(result.total) || 0;
    expandedGameId.value = null;
    emit("gamesLoaded", { ...result, items: games.value, total: total.value, page: page.value, size });
  } catch {
    if (sequence === requestSequence) {
      error.value = "Impossible de charger les parties. Réessaie dans un instant.";
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function previousPage(): void {
  if (page.value <= 1 || loading.value) return;
  page.value -= 1;
  void loadGames();
}

function nextPage(): void {
  if (page.value * size >= total.value || loading.value) return;
  page.value += 1;
  void loadGames();
}

function toggleGame(matchId: string): void {
  expandedGameId.value = expandedGameId.value === matchId ? null : matchId;
}

function reviewMatchId(review: ReviewRecord): string | undefined {
  return review.match_id || review.payload?.meta?.match_id || review.meta?.match_id;
}

function matchCoachInfo(matchId: string): MatchCoachInfo | null {
  return props.coachingContext?.matches?.[matchId] || null;
}

function hasReview(matchId: string): boolean {
  const status = matchCoachInfo(matchId)?.review_status;
  if (status) return status === "ready" || status === "stale";
  return props.gameReviews.some((review) => reviewMatchId(review) === matchId);
}

function pedagogicTarget(game: GameSummary): (NonNullable<MatchCoachInfo["pedagogic"]> & { badge: string }) | null {
  const target = matchCoachInfo(game.match_id)?.pedagogic;
  return target ? { ...target, badge: target.label || "Partie recommandée" } : null;
}

function isGameCoachRunning(matchId: string): boolean {
  return props.job?.type === "game-coach" && props.job.status === "running" && props.job.matchId === matchId;
}

function coachButtonText(game: GameSummary): string {
  const info = matchCoachInfo(game.match_id);
  if (isGameCoachRunning(game.match_id)) return `Analyse Ollama en cours… ${props.job?.progress || ""}`.trim();
  if (hasReview(game.match_id)) return "Voir l'analyse coaching LLM →";
  if (info && !info.analyzable) return "Journal indisponible, relance le sync";
  if (!props.authenticated) return "🔒 Connexion requise pour analyser";
  return pedagogicTarget(game) ? "Analyser cette partie recommandée →" : "Analyser cette partie avec l'IA →";
}

watch(() => props.slug, () => {
  page.value = 1;
  void loadGames();
});

onMounted(loadGames);
</script>

<template>
  <div>
    <div class="section-heading">
      <div>
        <h2>Parties récentes</h2>
      </div>
    </div>

    <div v-if="loading" class="state">Chargement…</div>
    <div v-else-if="error" class="state err">{{ error }}</div>
    <div v-else-if="games.length === 0" class="state empty-state">
      <strong>Aucune partie disponible.</strong>
      <span>Lance la mise à jour locale, puis reviens ici.</span>
    </div>

    <div v-else>
      <div
        v-for="game in games"
        :key="game.match_id"
        class="game-card"
        :class="[game.win ? 'w' : 'l', expandedGameId === game.match_id ? 'is-expanded' : '']"
      >
        <div
          class="game-row"
          role="button"
          tabindex="0"
          :aria-expanded="expandedGameId === game.match_id"
          :title="expandedGameId === game.match_id ? 'Cliquer pour replier les détails' : 'Cliquer pour voir tous les détails et stats de la partie'"
          @click="toggleGame(game.match_id)"
          @keydown.enter.prevent="toggleGame(game.match_id)"
          @keydown.space.prevent="toggleGame(game.match_id)"
        >
          <div class="gr-champ-wrap">
            <img class="champ-icon" :src="championIcon(game.champion, game.patch)" :alt="game.champion" loading="lazy" @error="fallbackChampionIcon($event, game.champion)">
            <span class="champ-fallback" style="display:none">{{ game.champion }}</span>
          </div>
          <div class="gr-main">
            <div class="gr-top-row">
              <span class="outcome-pill" :class="game.win ? 'pill-win' : 'pill-loss'">{{ game.win ? "VICTOIRE" : "DÉFAITE" }}</span>
              <span class="gr-champ">{{ game.champion }}</span>
              <div v-if="game.role" class="gr-role-tag">
                <img v-if="roleIcon(game.role)" class="role-icon" :src="roleIcon(game.role)" alt="" loading="lazy">
                <span>{{ roleLabel(game.role) }}</span>
              </div>
              <div v-if="game.lane?.opponent" class="gr-matchup" title="Adversaire de lane direct">
                <span class="gr-vs">VS</span>
                <img class="gr-opp-icon" :src="championIcon(game.lane.opponent, game.patch)" :alt="game.lane.opponent" loading="lazy" @error="fallbackChampionIcon($event, game.lane?.opponent)">
                <span class="gr-opp-name">{{ game.lane.opponent }}</span>
              </div>
            </div>
            <div class="gr-sub-row faint">
              <span class="gr-queue-badge">{{ queueLabel(game.queue) }}</span>
              <template v-if="game.game_ts">
                <span class="gr-sub-sep" aria-hidden="true">·</span>
                <span class="gr-date" :title="formatFullDate(game.game_ts)">{{ formatGameDate(game.game_ts) }}</span>
              </template>
              <template v-if="game.lane?.gd14 != null">
                <span class="gr-sub-sep" aria-hidden="true">·</span>
                <span class="gr-diff" :class="game.lane.gd14 >= 0 ? 'diff-pos' : 'diff-neg'">
                  {{ game.lane.gd14 >= 0 ? "+" : "" }}{{ game.lane.gd14 }}g à 14m
                </span>
              </template>
              <span v-if="hasReview(game.match_id)" class="gr-badge-coach">
                {{ matchCoachInfo(game.match_id)?.review_status === "stale" ? "✦ Coaching LLM à régénérer" : "✦ Coaching LLM prêt" }}
              </span>
              <span
                v-else-if="pedagogicTarget(game)"
                class="gr-badge-pedagogic"
                :class="`badge-${pedagogicTarget(game)?.kind}`"
                :title="pedagogicTarget(game)?.hint"
              >{{ pedagogicTarget(game)?.badge }}</span>
            </div>
          </div>
          <div class="gr-kda num"><span class="gr-label">KDA</span><span>{{ formatKda(game) }}</span></div>
          <div class="gr-patch faint"><span class="gr-label">Patch</span><span>{{ game.patch }}</span></div>
          <div class="gr-expand-action">
            <span class="gr-expand-label">{{ expandedGameId === game.match_id ? "Fermer" : "Détails" }}</span>
            <span class="gr-expand-chevron" :class="{ open: expandedGameId === game.match_id }">▾</span>
          </div>
        </div>

        <div v-show="expandedGameId === game.match_id" class="game-details-panel">
          <div class="gd-action-bar">
            <div class="gd-meta-info">
              <span class="gd-meta-tag mono">{{ game.match_id }}</span>
              <span class="gd-meta-tag">{{ queueLabel(game.queue) }}</span>
              <span v-if="game.game_ts" class="gd-meta-tag gd-meta-date" :title="formatFullDate(game.game_ts)">📅 {{ formatGameDate(game.game_ts) }}</span>
              <span v-if="hasReview(game.match_id)" class="gd-coach-status ready">
                <span class="pulse-dot"></span>
                <span>{{ matchCoachInfo(game.match_id)?.review_status === "stale" ? "Analyse LLM existante (ancienne version)" : "Analyse LLM disponible pour ce match" }}</span>
              </span>
              <div v-else class="gd-coach-unreviewed-group">
                <span class="gd-coach-status empty">◌ Non analysée individuellement</span>
                <span
                  v-if="pedagogicTarget(game)"
                  class="pedagogic-target-pill"
                  :class="`pill-${pedagogicTarget(game)?.kind}`"
                  :title="pedagogicTarget(game)?.hint"
                >{{ pedagogicTarget(game)?.badge }}</span>
              </div>
            </div>
            <button
              type="button"
              class="btn-coach-shortcut"
              :disabled="coachBusy || Boolean(!hasReview(game.match_id) && matchCoachInfo(game.match_id) && !matchCoachInfo(game.match_id)?.analyzable)"
              @click.stop="emit('coachGame', game)"
            >
              <span class="coach-icon">{{ hasReview(game.match_id) || authenticated ? "🎯" : "🔒" }}</span>
              <span class="coach-txt">{{ coachButtonText(game) }}</span>
            </button>
            <button
              v-if="matchCoachInfo(game.match_id)?.review_status === 'stale'"
              type="button"
              class="btn btn-small"
              :disabled="coachBusy"
              title="Cette action effectue un nouvel appel Ollama"
              @click.stop="emit('regenerateGame', game)"
            >{{ authenticated ? "Régénérer" : "🔒 Régénérer" }}</button>
          </div>

          <div class="gd-grid">
            <div class="gd-card">
              <div class="gd-card-header"><span class="gd-icon">⚔️</span><h4>Face-à-face & Phase de Lane</h4></div>
              <div class="gd-card-body">
                <div v-if="game.lane?.opponent" class="gd-matchup-box">
                  <div class="gd-matchup-side self">
                    <img class="gd-mini-icon" :src="championIcon(game.champion, game.patch)" :alt="game.champion" @error="fallbackChampionIcon($event, game.champion)">
                    <div><strong>{{ game.champion }}</strong><span class="faint">Toi</span></div>
                  </div>
                  <span class="gd-matchup-vs">VS</span>
                  <div class="gd-matchup-side opp">
                    <img class="gd-mini-icon" :src="championIcon(game.lane.opponent, game.patch)" :alt="game.lane.opponent" @error="fallbackChampionIcon($event, game.lane?.opponent)">
                    <div><strong>{{ game.lane.opponent }}</strong><span class="faint">Adversaire direct</span></div>
                  </div>
                </div>
                <div class="gd-stats-list">
                  <div class="gd-stat-row">
                    <span class="gd-stat-label">Écart d'or (GD)</span>
                    <div class="gd-stat-group">
                      <span class="gd-diff-pill" :class="diffClass(game.lane?.gd10)" title="Gold Diff @ 10 min">10m: <strong>{{ formatDiff(game.lane?.gd10, "g") }}</strong></span>
                      <span class="gd-diff-pill" :class="diffClass(game.lane?.gd14)" title="Gold Diff @ 14 min">14m: <strong>{{ formatDiff(game.lane?.gd14, "g") }}</strong></span>
                      <span v-if="game.lane?.gd20 != null" class="gd-diff-pill" :class="diffClass(game.lane?.gd20)" title="Gold Diff @ 20 min">20m: <strong>{{ formatDiff(game.lane?.gd20, "g") }}</strong></span>
                    </div>
                  </div>
                  <div class="gd-stat-row">
                    <span class="gd-stat-label">Écart de sbires (CSD)</span>
                    <div class="gd-stat-group">
                      <span class="gd-diff-pill" :class="diffClass(game.lane?.csd10)" title="CS Diff @ 10 min">10m: <strong>{{ formatDiff(game.lane?.csd10, " cs") }}</strong></span>
                      <span class="gd-diff-pill" :class="diffClass(game.lane?.csd14)" title="CS Diff @ 14 min">14m: <strong>{{ formatDiff(game.lane?.csd14, " cs") }}</strong></span>
                    </div>
                  </div>
                  <div class="gd-stat-row">
                    <span class="gd-stat-label">Écart d'expérience (XPD)</span>
                    <div class="gd-stat-group"><span class="gd-diff-pill" :class="diffClass(game.lane?.xpd10)" title="XP Diff @ 10 min">10m: <strong>{{ formatDiff(game.lane?.xpd10, " xp") }}</strong></span></div>
                  </div>
                  <div class="gd-stat-row"><span class="gd-stat-label">Rythme à 14m</span><span class="num text-highlight">{{ formatNumber(game.lane?.csm14) }} cs/min · {{ formatNumber(game.lane?.gpm14, 0) }} g/min</span></div>
                  <div v-if="game.plates_diff_early != null" class="gd-stat-row"><span class="gd-stat-label">Diff. plaques early</span><span class="gd-diff-pill" :class="diffClass(game.plates_diff_early)"><strong>{{ formatDiff(game.plates_diff_early) }}</strong> plaques</span></div>
                </div>
              </div>
            </div>

            <div class="gd-card">
              <div class="gd-card-header"><span class="gd-icon">👁️</span><h4>Vision & Contrôle de Carte</h4></div>
              <div class="gd-card-body"><div class="gd-stats-list">
                <div class="gd-stat-row"><span class="gd-stat-label">Balises posées</span><span class="num"><strong>{{ game.position?.wards_placed ?? "—" }}</strong><span v-if="game.position?.wards_placed_early != null" class="faint"> ({{ game.position.wards_placed_early }} en early)</span></span></div>
                <div class="gd-stat-row"><span class="gd-stat-label">Balises de contrôle (Pink)</span><span class="num"><strong class="text-pink">{{ game.position?.control_wards_placed ?? 0 }}</strong></span></div>
                <div class="gd-stat-row"><span class="gd-stat-label">Balises détruites</span><span class="num"><strong>{{ game.position?.wards_killed ?? 0 }}</strong></span></div>
                <div class="gd-stat-row"><span class="gd-stat-label">Temps en sur-extension</span><span class="num" :class="(game.position?.frac_overextended || 0) > 0.15 ? 'text-danger' : 'text-good'"><strong>{{ formatPercent(game.position?.frac_overextended) }}</strong></span></div>
                <div class="gd-stat-row"><span class="gd-stat-label">Morts subies dans le brouillard</span><span class="num" :class="(game.position?.frac_deaths_in_fog || 0) > 0.5 ? 'text-warning' : ''"><strong>{{ formatPercent(game.position?.frac_deaths_in_fog) }}</strong></span></div>
                <div v-if="game.position?.gold_dead_time != null" class="gd-stat-row"><span class="gd-stat-label">Or perdu pendant les morts</span><span class="num text-danger"><strong>{{ formatGold(game.position.gold_dead_time) }}</strong></span></div>
              </div></div>
            </div>

            <div class="gd-card gd-card-full">
              <div class="gd-card-header"><span class="gd-icon">👥</span><h4>Compositions d'Équipes & Plan de Jeu Early</h4></div>
              <div class="gd-card-body">
                <div v-if="sideSummary(game)" class="gd-sides-banner">
                  <div class="gd-sides-row">
                    <div class="gd-side-item ally"><span class="gd-side-label">Alliés :</span><span class="gd-side-val"><strong>{{ game.sides?.ally_jungler || "Jungle" }}</strong> start <span class="mono">{{ game.sides?.ally_start }}</span> ➔ <span class="badge-side" :class="game.sides?.ally_strongside === 'BOT' ? 'badge-strongside' : 'badge-weakside'">Bot {{ game.sides?.ally_strongside === "BOT" ? "STRONGSIDE" : "WEAKSIDE" }}</span><span class="faint">· Top {{ game.sides?.ally_strongside === "TOP" ? "Strongside" : "Weakside" }}</span></span></div>
                    <div class="gd-side-item enemy"><span class="gd-side-label">Ennemis :</span><span class="gd-side-val"><strong>{{ game.sides?.enemy_jungler || "Jungle" }}</strong> start <span class="mono">{{ game.sides?.enemy_start }}</span> ➔ <span class="badge-side" :class="game.sides?.enemy_strongside === 'BOT' ? 'badge-strongside' : 'badge-weakside'">Bot {{ game.sides?.enemy_strongside === "BOT" ? "STRONGSIDE" : "WEAKSIDE" }}</span><span class="faint">· Top {{ game.sides?.enemy_strongside === "TOP" ? "Strongside" : "Weakside" }}</span></span></div>
                  </div>
                  <div class="gd-side-summary">{{ sideSummary(game) }}</div>
                </div>
                <div class="gd-teams-grid">
                  <div class="gd-team-col ally-team">
                    <div class="gd-team-title">Alliés (Équipe bleue)</div>
                    <div class="gd-team-players">
                      <div v-for="player in alliedTeam(game)" :key="`${player.role}-${player.champ}`" class="gd-player-row" :class="{ 'is-self': player.isSelf }">
                        <img class="gd-mini-icon" :src="championIcon(player.champ, game.patch)" :alt="player.champ" loading="lazy" @error="fallbackChampionIcon($event, player.champ)"><span class="gd-role-badge">{{ player.roleName }}</span><span class="gd-pname">{{ player.champ }}</span><span v-if="player.isSelf" class="gd-self-badge">Toi</span>
                      </div>
                      <div v-if="alliedTeam(game).length === 0" class="faint" style="font-size:11px;padding:8px 0">Composition non renseignée</div>
                    </div>
                  </div>
                  <div class="gd-team-col enemy-team">
                    <div class="gd-team-title">Adversaires (Équipe rouge)</div>
                    <div class="gd-team-players">
                      <div v-for="player in enemyTeam(game)" :key="`${player.role}-${player.champ}`" class="gd-player-row">
                        <img class="gd-mini-icon" :src="championIcon(player.champ, game.patch)" :alt="player.champ" loading="lazy" @error="fallbackChampionIcon($event, player.champ)"><span class="gd-role-badge">{{ player.roleName }}</span><span class="gd-pname">{{ player.champ }}</span>
                      </div>
                      <div v-if="enemyTeam(game).length === 0" class="faint" style="font-size:11px;padding:8px 0">Composition non renseignée</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="gd-card">
              <div class="gd-card-header"><span class="gd-icon">🐉</span><h4>Objectifs & Structures ({{ game.objectives?.length || 0 }})</h4></div>
              <div class="gd-card-body">
                <div v-if="!game.objectives?.length" class="gd-empty-objectives faint">Aucun monstre épique ou structure enregistrée sur cette partie.</div>
                <div v-else class="gd-objectives-timeline">
                  <div v-for="(objective, index) in game.objectives" :key="index" class="gd-obj-entry" :class="objective.is_ally ? 'ally' : 'enemy'">
                    <span class="gd-obj-time">{{ objective.minute }}m</span><span class="gd-obj-icon">{{ objectiveIcon(objective) }}</span><span class="gd-obj-name">{{ objectiveLabel(objective) }}</span><span class="gd-obj-team-badge" :class="objective.is_ally ? 'badge-ally' : 'badge-enemy'">{{ objective.is_ally ? "Alliés" : "Ennemis" }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="gd-card">
              <div class="gd-card-header gd-combat-header">
                <div class="gd-combat-title-wrap"><span class="gd-icon">⚔️</span><h4>Journal des Combats ({{ combatCount(game, "all") }})</h4></div>
                <div class="gd-combat-filters">
                  <button type="button" class="combat-filter-btn" :class="{ active: combatFilter === 'all' }" @click="combatFilter = 'all'">Tous ({{ combatCount(game, "all") }})</button>
                  <button type="button" class="combat-filter-btn filter-kill" :class="{ active: combatFilter === 'kill' }" @click="combatFilter = 'kill'">K ({{ combatCount(game, "kill") }})</button>
                  <button type="button" class="combat-filter-btn filter-death" :class="{ active: combatFilter === 'death' }" @click="combatFilter = 'death'">D ({{ combatCount(game, "death") }})</button>
                  <button type="button" class="combat-filter-btn filter-assist" :class="{ active: combatFilter === 'assist' }" @click="combatFilter = 'assist'">A ({{ combatCount(game, "assist") }})</button>
                </div>
              </div>
              <div class="gd-card-body">
                <div v-if="combatEvents(game, combatFilter).length === 0" class="gd-flawless"><span class="flawless-icon">🕊️</span><strong>Aucun combat enregistré</strong><span class="faint">Aucune élimination, mort ou assistance dans cette sélection.</span></div>
                <div v-else class="gd-combat-timeline">
                  <div v-for="(event, index) in combatEvents(game, combatFilter)" :key="index" class="gd-combat-entry" :class="`entry-${event.type}`">
                    <span class="gd-combat-time">{{ event.minute }}m</span><span class="gd-combat-type-badge" :class="`badge-${event.type}`">{{ event.type === "kill" ? "KILL" : event.type === "death" ? "MORT" : "ASSIST" }}</span>
                    <div class="gd-combat-target"><img class="gd-mini-icon" :src="championIcon(event.champ, game.patch)" :alt="event.champ || 'Inconnu'" loading="lazy" @error="fallbackChampionIcon($event, event.champ)"><div class="gd-combat-names"><span class="gd-combat-champ">{{ event.champ }}</span><span v-if="event.type === 'assist' && event.killer_champ" class="gd-combat-sub faint">par {{ event.killer_champ }}</span></div></div>
                    <span class="gd-combat-zone">{{ zoneLabel(event.zone) }}</span>
                    <div class="gd-combat-tags"><span v-if="event.is_solo" class="gd-tag tag-solo" :title="event.type === 'kill' ? 'Élimination 1v1 sans assistance' : 'Mort en duel 1v1 sans assistance ennemie'">Solo</span><span v-if="event.is_ganked_by_jungle" class="gd-tag tag-gank" title="Le jungler ennemi est intervenu dans l'action">Gank Jungle</span><span v-if="event.is_2v2" class="gd-tag tag-2v2" title="Combat 2v2 opposant uniquement les deux duos botlane">2v2 Bot</span><span v-if="event.gold_state === 'behind'" class="gd-tag tag-behind" title="Déficit de plus de 600 pièces d'or face à l'adversaire direct de lane au moment de l'action">En retard</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row" style="justify-content:space-between;margin-top:16px">
        <button class="btn" :disabled="page <= 1 || loading" @click="previousPage">← Précédent</button>
        <span class="faint">page {{ page }} / {{ pageCount }}</span>
        <button class="btn" data-testid="next-page" :disabled="page * size >= total || loading" @click="nextPage">Suivant →</button>
      </div>
    </div>
  </div>
</template>
