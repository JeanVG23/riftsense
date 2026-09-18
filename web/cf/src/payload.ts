/** Payload de coaching agrégé — portage déterministe de src/04_coaching/payload.py. */

export type Outcome = "overall" | "win" | "loss";

export interface BuildArgs {
  player: string;
  scope: string;
  target: string;
  outcome: Outcome;
}

type JsonRecord = Record<string, any>;

export const ROLE_SCOPES: Record<string, string | null> = {
  all: null, top: "TOP", jungle: "JUNGLE", mid: "MIDDLE",
  adc: "BOTTOM", support: "UTILITY",
};

const LANE_SIGNALS = ["gd10", "gd14", "gd20", "csd10", "csd14"];
const LANE_LABELS: Record<string, string> = {
  gd10: "gold diff @10",
  gd14: "gold diff @14",
  gd20: "gold diff @20",
  csd10: "cs diff @10",
  csd14: "cs diff @14",
};

type PositionMeta = [label: string, unit: string, threshold: number | null, descriptive: boolean];
const POS_META: Record<string, PositionMeta> = {
  frac_own_lane_early: ["% lane (early)", "pct", 0.08, false],
  frac_river_early: ["% river (early)", "pct", 0.08, false],
  frac_roam_mid: ["% roam (mid)", "pct", 0.08, false],
  frac_enemy_half: ["% moitié ennemie", "pct", 0.08, false],
  frac_base: ["% en base", "pct", 0.08, false],
  frac_overextended: ["% over-extended", "pct", null, true],
  avg_map_depth: ["profondeur moy.", "u", null, true],
  max_map_depth: ["profondeur max", "u", null, true],
  avg_dist_to_ally: ["isolement (allié)", "u", 200, false],
  gold_dead_time: ["temps mort (s)", "s", 20, false],
  wards_placed: ["wards posées", "ward", 2, false],
  wards_placed_early: ["wards early", "ward", 1, false],
  control_wards_placed: ["control wards", "ward", 1, false],
  wards_killed: ["wards détruites", "ward", 2, false],
};

const LOW_SAMPLE_THRESHOLD = 30;
export const MIN_CONTEXT_N = 8;

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function laneSignals(meFocus: JsonRecord, refFocus: JsonRecord): JsonRecord[] {
  const output: JsonRecord[] = [];
  const meLane = meFocus.lane ?? {};
  const refLane = refFocus.lane ?? {};
  for (const key of LANE_SIGNALS) {
    const you = meLane[key];
    const ref = refLane[key];
    if (you == null || ref == null) continue;
    const delta = you - ref;
    const unit = key.startsWith("cs") ? "cs" : "g";
    const notable = unit === "cs" ? Math.abs(delta) >= 2 : Math.abs(delta) > 150;
    output.push({
      group: "lane", key, label: LANE_LABELS[key], you, ref, delta, unit, notable,
    });
  }
  return output;
}

function positionSignals(meFocus: JsonRecord, refFocus: JsonRecord): JsonRecord[] {
  const output: JsonRecord[] = [];
  const mePosition = meFocus.positioning ?? {};
  const refPosition = refFocus.positioning ?? {};
  for (const key of Object.keys(POS_META).sort()) {
    const you = mePosition[key];
    const ref = refPosition[key];
    if (you == null || ref == null) continue;
    const [label, unit, threshold, descriptive] = POS_META[key];
    const delta = round4(you - ref);
    const signal: JsonRecord = {
      group: "positioning",
      key,
      label,
      you,
      ref,
      delta,
      unit,
      notable: threshold !== null && Math.abs(delta) >= threshold,
    };
    if (descriptive) signal.descriptive_only = true;
    output.push(signal);
  }
  return output;
}

function zonePhaseSignals(
  meFocus: JsonRecord,
  refFocus: JsonRecord,
  top = 5,
): JsonRecord[] {
  const meZones = meFocus.by_zone_phase ?? {};
  const refZones = refFocus.by_zone_phase ?? {};
  const keys = [...new Set([...Object.keys(meZones), ...Object.keys(refZones)])].sort();
  return keys.map((key) => {
    const you = meZones[key] ?? 0;
    const ref = refZones[key] ?? 0;
    const delta = round4(you - ref);
    return {
      group: "deaths_zone_phase",
      key,
      label: `morts ${key}`,
      you,
      ref,
      delta,
      unit: "pct",
      notable: delta >= 0.08,
    };
  }).sort((left, right) => right.delta - left.delta).slice(0, top);
}

function goldStateSignals(meFocus: JsonRecord, refFocus: JsonRecord): JsonRecord[] {
  const meGold = meFocus.death_gold_state ?? {};
  const refGold = refFocus.death_gold_state ?? {};
  const labels: Record<string, string> = {
    ahead: "morts en avance",
    even: "morts à égalité",
    behind: "morts en retard",
  };
  const output: JsonRecord[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const you = meGold[key];
    const ref = refGold[key];
    if (you == null || ref == null) continue;
    const delta = round4(you - ref);
    output.push({
      group: "death_gold_state",
      key,
      label,
      you,
      ref,
      delta,
      unit: "pct",
      notable: Math.abs(delta) >= 0.10,
    });
  }
  return output;
}

export function contextBenchmark(
  meAggregate: JsonRecord,
  refAggregate: JsonRecord,
  axis: "lane_pattern" | "gank_exposure",
): JsonRecord | null {
  const meBuckets = meAggregate.by_lane_context?.[axis] ?? {};
  const refBuckets = refAggregate.by_lane_context?.[axis] ?? {};
  const entries = Object.entries(meBuckets) as [string, JsonRecord][];
  if (entries.length === 0) return null;
  const candidates = entries.filter(([bucket]) => bucket !== "unknown");
  const eligible = candidates.length > 0 ? candidates : entries;
  let [bucket, meBucket] = eligible[0];
  for (const candidate of eligible.slice(1)) {
    if ((candidate[1].n_games ?? 0) > (meBucket.n_games ?? 0)) {
      [bucket, meBucket] = candidate;
    }
  }
  const nMe = meBucket.n_games ?? 0;
  const gd10Me = meBucket.lane?.gd10 ?? null;
  const refBucket = refBuckets[bucket] ?? {};
  const nRef = refBucket.n_games ?? 0;
  if (nRef < MIN_CONTEXT_N) {
    return {
      bucket,
      n_me: nMe,
      n_ref: nRef,
      gd10_me: gd10Me,
      gd10_ref: refAggregate.overall?.lane?.gd10 ?? null,
      fallback: true,
      reason: `réf. ${bucket}=${nRef}<${MIN_CONTEXT_N} games → repli global`,
    };
  }
  return {
    bucket,
    n_me: nMe,
    n_ref: nRef,
    gd10_me: gd10Me,
    gd10_ref: refBucket.lane?.gd10 ?? null,
    fallback: false,
    reason: null,
  };
}

export function buildPayload(
  me: JsonRecord,
  ref: JsonRecord,
  args: BuildArgs,
): JsonRecord {
  if (!(args.scope.toLowerCase() in ROLE_SCOPES)) {
    throw new Error(`scope de benchmark inconnu : ${args.scope}`);
  }
  const meFocus = me[args.outcome];
  const refFocus = ref[args.outcome];
  const deathsPerGame: JsonRecord = {};
  for (const outcome of ["overall", "win", "loss"] as const) {
    deathsPerGame[outcome] = {
      you: me[outcome].deaths_per_game,
      ref: ref[outcome].deaths_per_game,
    };
  }
  const meta = {
    player: args.player,
    scope: args.scope,
    target: args.target,
    outcome_focus: args.outcome,
    patch: me.patch ?? "?",
    n_games_me: me.n_games,
    n_games_ref: ref.n_games,
    winrate_me: me.winrate,
    low_sample: me.n_games < LOW_SAMPLE_THRESHOLD,
    deaths_per_game: deathsPerGame,
    qualitative_mode: "none",
    n_game_reviews_available: 0,
    n_game_reviews_available_wins: 0,
    n_game_reviews_available_losses: 0,
    n_game_reviews_used: 0,
    n_game_reviews_used_wins: 0,
    n_game_reviews_used_losses: 0,
    // Alias historiques, conservés pendant la migration du frontend.
    n_game_reviews_wins: 0,
    n_game_reviews_losses: 0,
    unbalanced_causes: false,
  };
  const signals = [
    ...laneSignals(meFocus, refFocus),
    ...positionSignals(meFocus, refFocus),
    ...zonePhaseSignals(meFocus, refFocus),
    ...goldStateSignals(meFocus, refFocus),
  ];
  const context: JsonRecord = {};
  for (const axis of ["lane_pattern", "gank_exposure"] as const) {
    const benchmark = contextBenchmark(me, ref, axis);
    if (benchmark !== null) context[axis] = benchmark;
  }
  return { meta, signals, context };
}

export function reviewMatchesScope(record: JsonRecord, scope: string): boolean {
  const wanted = scope.toLowerCase();
  if (!(wanted in ROLE_SCOPES)) return false;
  if (wanted === "all") return true;
  const meta = record.payload?.meta ?? {};
  const role = ROLE_SCOPES[wanted];
  return (role !== null && meta.role === role)
    || String(record.scope ?? meta.scope ?? "").toLowerCase() === wanted;
}

/** Sélection qualitative bornée avec compteurs disponibles et réellement utilisés. */
export function gameReviewSample(
  reviews: JsonRecord[],
  scope: string,
  maxPerOutcome = 2,
): JsonRecord {
  if (maxPerOutcome < 1) throw new Error("maxPerOutcome doit être >= 1");
  const mappedRows = reviews.filter((record) => {
    return record.kind === "game" && reviewMatchesScope(record, scope);
  }).sort((left, right) => {
    const byTs = String(right.ts ?? "").localeCompare(String(left.ts ?? ""));
    if (byTs !== 0) return byTs;
    const leftMeta = left.payload?.meta ?? {};
    const rightMeta = right.payload?.meta ?? {};
    return String(right.match_id ?? rightMeta.match_id ?? "")
      .localeCompare(String(left.match_id ?? leftMeta.match_id ?? ""));
  })
    .map((record) => {
      const meta = record.payload?.meta ?? {};
      const qualitative = (section: "strengths" | "mistakes") =>
        (record.review?.[section] ?? []).filter((insight: JsonRecord) =>
          typeof insight?.point === "string"
            && typeof insight?.cause === "string"
            && insight.cause.trim() !== "")
          .map((insight: JsonRecord) => ({ point: insight.point, cause: insight.cause }));
      return {
        ts: record.ts ?? "",
        match_id: record.match_id ?? meta.match_id ?? "",
        champion: meta.champion ?? null,
        outcome: meta.win ? "win" : "loss",
        strengths: qualitative("strengths"),
        mistakes: qualitative("mistakes"),
      };
    }).filter((row) => row.strengths.length > 0 || row.mistakes.length > 0);

  const seenMatches = new Set<string>();
  const mapped = mappedRows.filter((row) => {
    const identity = row.match_id || `legacy:${row.ts}`;
    if (seenMatches.has(identity)) return false;
    seenMatches.add(identity);
    return true;
  });

  const wins = mapped.filter((r) => r.outcome === "win");
  const losses = mapped.filter((r) => r.outcome === "loss");

  let selected: typeof mapped;
  let mode: "none" | "unbalanced" | "balanced";
  if (mapped.length === 0) {
    mode = "none";
    selected = [];
  } else if (wins.length > 0 && losses.length > 0) {
    mode = "balanced";
    const takeEach = Math.min(wins.length, losses.length, maxPerOutcome);
    const selectedWins = wins.slice(0, takeEach);
    const selectedLosses = losses.slice(0, takeEach);
    selected = [...selectedWins, ...selectedLosses].sort((a, b) =>
      String(b.ts).localeCompare(String(a.ts))
        || String(b.match_id).localeCompare(String(a.match_id))
    );
  } else {
    mode = "unbalanced";
    selected = mapped.slice(0, 1);
  }

  const cleaned = selected.map(({ ts: _ts, match_id: _matchId, ...rest }) => rest);
  const usedWins = cleaned.filter((row) => row.outcome === "win").length;
  return {
    mode,
    available: { total: mapped.length, wins: wins.length, losses: losses.length },
    used: { total: cleaned.length, wins: usedWins, losses: cleaned.length - usedWins },
    causes: cleaned,
  };
}

/** Ajoute au payload l'échantillon qualitatif régulé et ses compteurs explicites. */
export function addGameReviewCauses(
  payload: JsonRecord,
  reviews: JsonRecord[],
  scope: string,
  maxPerOutcome = 2,
): JsonRecord {
  const sample = gameReviewSample(reviews, scope, maxPerOutcome);
  const available = sample.available;
  const used = sample.used;

  const result: JsonRecord = {
    ...payload,
    meta: {
      ...payload.meta,
      qualitative_mode: sample.mode,
      n_game_reviews_available: available.total,
      n_game_reviews_available_wins: available.wins,
      n_game_reviews_available_losses: available.losses,
      n_game_reviews_used: used.total,
      n_game_reviews_used_wins: used.wins,
      n_game_reviews_used_losses: used.losses,
      // Compatibilité temporaire avec l'UI et les anciens payloads.
      n_game_reviews_wins: available.wins,
      n_game_reviews_losses: available.losses,
      unbalanced_causes: sample.mode === "unbalanced",
    },
  };
  if (sample.causes.length > 0) result.game_review_causes = sample.causes;
  return result;
}
