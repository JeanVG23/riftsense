import { pedagogicTarget } from "./curation";
import { mainRoleFromAnalysis, mainRoleLabel } from "./main_role";
import { reviewMatchesScope } from "./payload";
import {
  KEYS, matchSeq, readGamePayloadBundle, readJsonl, readRoleShap, type KVLike,
} from "./readers";
import { SYSTEM, SYSTEM_GAME, versionOf } from "./prompt";

type JsonRecord = Record<string, any>;

function matchIdOf(review: JsonRecord): string {
  return String(review.match_id ?? review.payload?.meta?.match_id ?? "");
}

export async function buildCoachingContext(kv: KVLike, slug: string): Promise<JsonRecord> {
  const [games, reviews, bundle, roleAnalysis, promptVersion, globalPromptVersion] = await Promise.all([
    readJsonl<JsonRecord>(kv, KEYS.games(slug)),
    readJsonl<JsonRecord>(kv, KEYS.reviews(slug)),
    readGamePayloadBundle(kv, slug),
    readRoleShap(kv, slug),
    versionOf(SYSTEM_GAME),
    versionOf(SYSTEM),
  ]);
  const mainRole = mainRoleFromAnalysis(roleAnalysis);
  const roleGames = mainRole ? games.filter((game) => game.role === mainRole.role) : [];
  const scopes = mainRole ? [{
    id: mainRole.scope,
    label: "Global",
    rawLabel: mainRoleLabel(mainRole.role),
    kind: "main-role",
    n_games: roleGames.length,
    share: games.length ? roleGames.length / games.length : 0,
  }] : [];
  const defaultScope = mainRole?.scope ?? null;

  const gameReviews = reviews.filter((review) => review.kind === "game")
    .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  const latestByMatch = new Map<string, JsonRecord>();
  for (const review of gameReviews) {
    const matchId = matchIdOf(review);
    if (matchId && !latestByMatch.has(matchId)) latestByMatch.set(matchId, review);
  }
  const latestGameReviews = [...latestByMatch.values()];
  const currentGameReviews = latestGameReviews.filter((review) =>
    review.run?.prompt_version === promptVersion
  );

  const unavailable = new Map(bundle.unavailable.map((entry) =>
    [String(entry.match_id), String(entry.reason)]
  ));
  const selectedMatchIds = new Set([...games]
    .sort((a, b) => {
      const byTimestamp = Number(b.game_ts ?? 0) - Number(a.game_ts ?? 0);
      if (byTimestamp !== 0) return byTimestamp;
      const bySequence = matchSeq(String(b.match_id ?? ""))
        - matchSeq(String(a.match_id ?? ""));
      if (bySequence !== 0) return bySequence;
      return String(b.match_id ?? "").localeCompare(String(a.match_id ?? ""));
    })
    .slice(0, Math.max(0, bundle.max_games))
    .map((game) => String(game.match_id ?? "")));

  const matches: JsonRecord = {};
  for (const game of games) {
    const matchId = String(game.match_id ?? "");
    if (!matchId) continue;
    const entry = bundle.items[matchId];
    const latest = latestByMatch.get(matchId);
    let reviewStatus: "none" | "ready" | "stale" = "none";
    if (latest) {
      // `payload_hash` n'est ecrit que par le Worker : une review produite par
      // `coach.py` n'en a pas. L'exiger classait perimee toute review locale, et
      // l'UI invitait a repayer une generation deja validee. Absent, le prompt
      // tranche seul ; present, il doit correspondre au payload servi.
      const hash = latest.run?.payload_hash;
      reviewStatus = entry
        && (hash === undefined || hash === null || hash === entry.payload_hash)
        && latest.run?.prompt_version === promptVersion ? "ready" : "stale";
    }
    const unavailableReason = entry ? null
      : unavailable.get(matchId)
        ?? (bundle.generated_at && !selectedMatchIds.has(matchId)
          ? "outside_window"
          : "bundle_missing");
    matches[matchId] = {
      analyzable: Boolean(entry),
      analysis_unavailable_reason: unavailableReason,
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
    const eligible = currentGameReviews.filter((review) => reviewMatchesScope(review, scope.id));
    const wins = eligible.filter((review) => review.payload?.meta?.win === true).length;
    reviewSamples[scope.id] = {
      available: eligible.length,
      available_wins: wins,
      available_losses: eligible.length - wins,
      latest_ts: eligible[0]?.ts ?? null,
    };
    aggregateStatus[scope.id] = {};
    for (const outcome of ["overall"]) {
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
    main_role: mainRole?.role ?? null,
    main_role_scope: mainRole?.scope ?? null,
    main_role_label: mainRole ? mainRoleLabel(mainRole.role) : null,
    scopes,
    matches,
    review_samples: reviewSamples,
    aggregate_status: aggregateStatus,
    current_global_prompt_version: globalPromptVersion,
    current_game_prompt_version: promptVersion,
    payloads_generated_at: bundle.generated_at,
  };
}
