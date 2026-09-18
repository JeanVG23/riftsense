import { describe, expect, it } from "vitest";
import { gameCoachFlow, type GameCoachParams } from "../src/game_coach";
import { KEYS, readJsonl, type KVLike } from "../src/readers";
import { GAME_REVIEW_SCHEMA_VERSION } from "../src/generated/shared";

class MemoryKV implements KVLike {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

const PAYLOAD = {
  meta: {
    match_id: "EUW1_42", champion: "Zeri", opponent: "Jinx", role: "BOTTOM",
    win: false, duration_min: 30, target: "challenger", scope: "adc",
  },
  journal: { deaths: [{ clock: "12:30" }], recalls: [] },
  benchmarks: { outcome: "loss" },
};
const REVIEW = {
  strengths: [],
  mistakes: [{ point: "Prépare la vague", cause: "recall tardif", evidence: "12:30" }],
  next_focus: "Anticipe ton prochain reset.",
  confidence: 0.7,
};
const PARAMS: GameCoachParams = {
  slug: "spadzze", matchId: "EUW1_42", model: "kimi-k2.6", force: false,
};

async function seed() {
  const kv = new MemoryKV();
  await kv.put(KEYS.game_payloads("spadzze"), JSON.stringify({
    generated_at: "2026-09-06", target: "challenger", max_games: 50,
    items: { EUW1_42: { payload_hash: "abc123", benchmark_scope: "adc", payload: PAYLOAD } },
    unavailable: [],
  }));
  return kv;
}

async function collect(generator: AsyncGenerator<{ event: string; data: any }>) {
  const events: Array<{ event: string; data: any }> = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe("gameCoachFlow", () => {
  it("génère, versionne et persiste une review", async () => {
    const kv = await seed();
    const events = await collect(gameCoachFlow({
      kv, generate: async () => REVIEW, now: () => "2026-09-06T12:00:00Z",
    }, PARAMS));
    expect(events.map((event) => event.event)).toEqual(["payload", "llm", "review"]);
    const record = events[2].data;
    expect(record).toMatchObject({ kind: "game", match_id: "EUW1_42", scope: "adc" });
    expect(record.run).toMatchObject({ payload_hash: "abc123" });
    expect(record.run.prompt_version).toMatch(/^[a-f0-9]{12}$/);
    expect(record.run.schema_version).toBe(GAME_REVIEW_SCHEMA_VERSION);
    expect(await readJsonl(kv, KEYS.reviews("spadzze"))).toEqual([record]);
  });

  it("retourne le cache sans appeler le LLM", async () => {
    const kv = new MemoryKV();
    const cached = { ts: "old", kind: "game", match_id: "EUW1_42", review: REVIEW };
    await kv.put(KEYS.reviews("spadzze"), JSON.stringify(cached));
    let calls = 0;
    const events = await collect(gameCoachFlow({
      kv, generate: async () => { calls += 1; return REVIEW; }, now: () => "new",
    }, PARAMS));
    expect(calls).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "review", data: { ts: "old", cached: true } });
  });

  it("force une nouvelle génération sans écraser l'ancienne", async () => {
    const kv = await seed();
    await kv.put(KEYS.reviews("spadzze"), JSON.stringify({
      ts: "old", kind: "game", match_id: "EUW1_42", review: REVIEW,
    }));
    await collect(gameCoachFlow({
      kv, generate: async () => REVIEW, now: () => "new",
    }, { ...PARAMS, force: true }));
    expect(await readJsonl(kv, KEYS.reviews("spadzze"))).toHaveLength(2);
  });

  it("partie absente et sortie invalide ne persistent rien", async () => {
    const kv = await seed();
    const missing = await collect(gameCoachFlow({
      kv, generate: async () => REVIEW, now: () => "t",
    }, { ...PARAMS, matchId: "EUW1_404" }));
    expect(missing.map((event) => event.event)).toEqual(["error"]);

    let calls = 0;
    const invalid = await collect(gameCoachFlow({
      kv, generate: async () => { calls += 1; return { strengths: [] }; }, now: () => "t",
    }, PARAMS));
    expect(calls).toBe(2);
    expect(invalid.map((event) => event.event)).toEqual(["payload", "llm", "error"]);
    expect(await readJsonl(kv, KEYS.reviews("spadzze"))).toEqual([]);
  });
});
