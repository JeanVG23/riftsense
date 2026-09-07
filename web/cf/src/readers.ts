/** Lectures KV — portage de web/backend/readers.py (mêmes sémantiques). */
import { paginate, type Page } from "./http";

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export const KEYS = {
  games: (slug: string) => `silver:${slug}:games`,
  rank: (slug: string) => `silver:${slug}:rank`,
  gold: (slug: string, scope: string) => `gold:${slug}:${scope}`,
  ref: (rank: string, scope: string) => `ref:${rank}:${scope}`,
  pred: (slug: string) => `pred:${slug}`,
  shap: (slug: string) => `shap:${slug}:drivers`,
  reviews: (slug: string) => `coaching:${slug}:reviews`,
  feedback: (slug: string) => `coaching:${slug}:feedback`,
  chats: (slug: string) => `coaching:${slug}:chats`,
  game_payloads: (slug: string) => `coaching:${slug}:game-payloads`,
};

export interface GamePayloadBundle {
  generated_at: string | null;
  target: string;
  max_games: number;
  items: Record<string, {
    payload_hash: string;
    benchmark_scope: string;
    payload: Record<string, unknown>;
  }>;
  unavailable: Array<{ match_id: string; reason: string }>;
}

export async function readGamePayloadBundle(
  kv: KVLike,
  slug: string,
): Promise<GamePayloadBundle> {
  const empty: GamePayloadBundle = {
    generated_at: null, target: "challenger", max_games: 0, items: {}, unavailable: [],
  };
  const value = await readJson<Partial<GamePayloadBundle>>(kv, KEYS.game_payloads(slug));
  if (!value || typeof value.items !== "object" || value.items === null
      || Array.isArray(value.items)) return empty;
  return {
    generated_at: typeof value.generated_at === "string" ? value.generated_at : null,
    target: typeof value.target === "string" ? value.target : "challenger",
    max_games: typeof value.max_games === "number" ? value.max_games : 0,
    items: value.items as GamePayloadBundle["items"],
    unavailable: Array.isArray(value.unavailable) ? value.unavailable : [],
  };
}

export function matchSeq(matchId: string): number {
  const tail = matchId.split("_").pop() ?? "";
  const n = Number(tail);
  return Number.isFinite(n) && tail !== "" ? n : 0;
}

export type GamesPage = Page<Record<string, unknown>>;

export async function readGames(
  kv: KVLike,
  slug: string,
  page = 1,
  size = 20,
): Promise<GamesPage> {
  const rows = await readJsonl<Record<string, unknown>>(kv, KEYS.games(slug));
  const items = [...rows].sort(
    (a, b) => matchSeq(String(b.match_id ?? "")) - matchSeq(String(a.match_id ?? "")),
  );
  return paginate(items, { page, size });
}

export async function readRank(
  kv: KVLike,
  slug: string,
): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(kv, KEYS.rank(slug));
}

export async function readPred(
  kv: KVLike,
  slug: string,
): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(kv, KEYS.pred(slug));
}

export async function readShap(
  kv: KVLike,
  slug: string,
): Promise<{ available: boolean; drivers: unknown[] }> {
  const value = await readJson(kv, KEYS.shap(slug));
  return Array.isArray(value)
    ? { available: true, drivers: value }
    : { available: false, drivers: [] };
}

export async function readJsonl<T = Record<string, unknown>>(
  kv: KVLike,
  key: string,
): Promise<T[]> {
  const raw = await kv.get(key);
  if (raw === null) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

export async function readJson<T = unknown>(
  kv: KVLike,
  key: string,
): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonl(
  kv: KVLike,
  key: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  await kv.put(key, rows.map((row) => JSON.stringify(row)).join("\n"));
}

export async function appendJsonl(
  kv: KVLike,
  key: string,
  record: Record<string, unknown>,
): Promise<void> {
  const lines = await readJsonl<Record<string, unknown>>(kv, key);
  lines.push(record);
  await writeJsonl(kv, key, lines);
}

/**
 * Remplace la ligne portant la même valeur de `idKey` (sinon ajoute).
 * `feedback.ts` refaisait ce read-modify-write à la main.
 */
export async function upsertJsonl(
  kv: KVLike,
  key: string,
  record: Record<string, unknown>,
  idKey = "ts",
): Promise<void> {
  const existing = await readJsonl<Record<string, unknown>>(kv, key);
  const kept = existing.filter((line) => line[idKey] !== record[idKey]);
  kept.push(record);
  await writeJsonl(kv, key, kept);
}
