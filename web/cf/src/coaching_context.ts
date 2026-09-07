import { pedagogicTarget } from "./curation";
import { reviewMatchesScope } from "./payload";
import {
  KEYS, readGamePayloadBundle, readJson, readJsonl, type KVLike,
} from "./readers";
import { SYSTEM, SYSTEM_GAME, versionOf } from "./prompt";

type JsonRecord = Record<string, any>;

const MIN_TOP_CHAMPION_GAMES = 5;
const MIN_TOP_CHAMPION_SHARE = 0.4;
const MAX_CHAMPION_SCOPES = 2;

function labelOf(champion: string): string {
  return champion || "Champion";
}

function matchIdOf(review: JsonRecord): string {
  return String(review.match_id ?? review.payload?.meta?.match_id ?? "");
}

export async function buildCoachingContext(kv: KVLike, slug: string): Promise<JsonRecord> {
  const [games, reviews, bundle, promptVersion, globalPromptVersion] = await Promise.all([
    readJsonl<JsonRecord>(kv, KEYS.games(slug)),
    readJsonl<JsonRecord>(kv, KEYS.reviews(slug)),
    readGamePayloadBundle(kv, slug),
    versionOf(SYSTEM_GAME),
    versionOf(SYSTEM),
  ]);
  const adcGames = games.filter((game) => game.role === "BOTTOM");
  const championCounts = new Map<string, { label: string; count: number }>();
  for (const game of adcGames) {
    const label = String(game.champion ?? "").trim();
    if (!label) continue;
    const id = label.toLowerCase();
    const current = championCounts.get(id) ?? { label, count: 0 };
    current.count += 1;
    championCounts.set(id, current);
  }
  const candidates = [...championCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .filter(([, info]) => info.count >= MIN_TOP_CHAMPION_GAMES)
    .slice(0, MAX_CHAMPION_SCOPES);

  const championScopes = (await Promise.all(candidates.map(async ([id, info]) => {
    const [personal, reference] = await Promise.all([
      readJson<JsonRecord>(kv, KEYS.gold(slug, id)),
      readJson<JsonRecord>(kv, KEYS.ref("challenger", id)),
    ]);
    if (!personal || !reference || Number(personal.n_games ?? 0) < 1
        || Number(reference.n_games ?? 0) < 1) return null;
    return {
      id, label: labelOf(info.label), rawLabel: labelOf(info.label),
      kind: "champion", n_games: info.count,
      share: adcGames.length ? info.count / adcGames.length : 0,
    };
  }))).filter((scope): scope is NonNullable<typeof scope> => scope !== null);

  const displayedChampionScopes = championScopes.map((scope, index) => ({
    ...scope,
    isTop: index === 0,
    label: `${index === 0 ? "⭐ " : ""}${scope.rawLabel} (${scope.n_games})`,
  }));

  const roleScopes = [
    { id: "all", label: "Toutes", rawLabel: "Toutes", kind: "role", n_games: games.length,
      share: games.length ? 1 : 0 },
    { id: "adc", label: "ADC", rawLabel: "ADC", kind: "role", n_games: adcGames.length,
      share: adcGames.length ? 1 : 0 },
  ];
  const scopes = [...roleScopes, ...displayedChampionScopes];
  const top = displayedChampionScopes[0];
  const defaultScope = top && top.n_games >= MIN_TOP_CHAMPION_GAMES
    && top.share >= MIN_TOP_CHAMPION_SHARE ? top.id : "adc";

  const gameReviews = reviews.filter((review) => review.kind === "game")
    .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  const latestByMatch = new Map<string, JsonRecord>();
  for (const review of gameReviews) {
    const matchId = matchIdOf(review);
    if (matchId && !latestByMatch.has(matchId)) latestByMatch.set(matchId, review);
  }
  const latestGameReviews = [...latestByMatch.values()];

  const matches: JsonRecord = {};
  for (const game of games) {
    const matchId = String(game.match_id ?? "");
    if (!matchId) continue;
    const entry = bundle.items[matchId];
    const latest = latestByMatch.get(matchId);
    let reviewStatus: "none" | "ready" | "stale" = "none";
    if (latest) {
      reviewStatus = entry
        && latest.run?.payload_hash === entry.payload_hash
        && latest.run?.prompt_version === promptVersion ? "ready" : "stale";
    }
    matches[matchId] = {
      analyzable: Boolean(entry),
      review_status: reviewStatus,
      review_ts: latest?.ts ?? null,
      pedagogic: entry ? pedagogicTarget(game, entry.payload as JsonRecord) : null,
    };
  }

  const reviewSamples: JsonRecord = {};
  const aggregateStatus: JsonRecord = {};
  const aggregateReviews = reviews.filter((review) => review.kind !== "game")
    .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  for (const scope of scopes) {
    const eligible = latestGameReviews.filter((review) => reviewMatchesScope(review, scope.id));
    const wins = eligible.filter((review) => review.payload?.meta?.win === true).length;
    reviewSamples[scope.id] = {
      available: eligible.length,
      available_wins: wins,
      available_losses: eligible.length - wins,
      latest_ts: eligible[0]?.ts ?? null,
    };
    aggregateStatus[scope.id] = {};
    for (const outcome of ["overall", "win", "loss"]) {
      const latest = aggregateReviews.find((review) =>
        String(review.scope ?? review.payload?.meta?.scope ?? "").toLowerCase() === scope.id
        && String(review.outcome_focus ?? review.payload?.meta?.outcome_focus ?? "overall") === outcome
      );
      const latestGameTs = eligible[0]?.ts ?? null;
      aggregateStatus[scope.id][outcome] = {
        review_ts: latest?.ts ?? null,
        needs_refresh: Boolean(latest && latestGameTs
          && String(latestGameTs) > String(latest.ts ?? "")),
        stale_prompt: Boolean(latest
          && latest.run?.prompt_version !== globalPromptVersion),
      };
    }
  }

  return {
    default_scope: defaultScope,
    scopes,
    matches,
    review_samples: reviewSamples,
    aggregate_status: aggregateStatus,
    current_global_prompt_version: globalPromptVersion,
    current_game_prompt_version: promptVersion,
    payloads_generated_at: bundle.generated_at,
  };
}
