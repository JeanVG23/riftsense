type JsonRecord = Record<string, any>;

export interface PedagogicTarget {
  kind: "loss" | "win";
  score: number;
  reasons: string[];
  label: string;
  hint: string;
}

function count(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function pedagogicTarget(
  game: JsonRecord,
  gamePayload?: JsonRecord,
): PedagogicTarget | null {
  const meta = gamePayload?.meta ?? {};
  const duration = Number(game.duration_min ?? meta.duration_min);
  const kda = meta.kda ?? {};
  const participation = count(game.kills ?? kda.kills) + count(game.assists ?? kda.assists);
  const lane = game.lane ?? {};

  if (game.win === false) {
    if (!Number.isFinite(duration) || duration < 22
        || !finite(lane.gd14) || lane.gd14 < -500 || participation < 3) return null;
    const reasons = ["long_game", "competitive_lane", "active_participation"];
    const laneText = lane.gd14 >= 0
      ? `Tu avais ${lane.gd14 >= 0 ? "+" : ""}${lane.gd14} g à 14 min.`
      : `La lane restait compétitive (${lane.gd14} g à 14 min).`;
    return {
      kind: "loss", score: 80 + Math.min(20, Math.max(0, Math.round(duration - 22))), reasons,
      label: "🎯 Défaite serrée",
      hint: `${laneText} Partie idéale pour auditer le passage vers le mid-game.`,
    };
  }

  if (game.win === true) {
    const opponent = lane.opponent ?? meta.opponent;
    if (!Number.isFinite(duration) || duration < 24 || participation < 3
        || typeof opponent !== "string" || opponent.trim() === ""
        || !finite(lane.csd14)) return null;
    return {
      kind: "win", score: 80 + Math.min(20, Math.max(0, Math.round(duration - 24))),
      reasons: ["long_game", "active_participation", "observable_lane_opponent"],
      label: "🛡️ Victoire disputée",
      hint: `Victoire de ${Math.round(duration)} min avec participation active. Idéale pour identifier tes leviers reproductibles.`,
    };
  }
  return null;
}
