import { describe, expect, it } from "vitest";
import { buildCoachingContext } from "../src/coaching_context";
import { KEYS, type KVLike } from "../src/readers";
import { SYSTEM_GAME, versionOf } from "../src/prompt";

class MemoryKV implements KVLike {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

describe("buildCoachingContext", () => {
  it("n'expose que les benchmarks globaux et ADC, même si d'anciens agrégats champion existent", async () => {
    const kv = new MemoryKV();
    const games = [
      ...Array.from({ length: 6 }, (_, i) => ({
        match_id: `z${i}`, role: "BOTTOM", champion: "Zeri", win: i % 2 === 0,
        kills: 2, assists: 2, lane: { gd14: 0, csd14: 0, opponent: "Jinx" },
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        match_id: `j${i}`, role: "BOTTOM", champion: "Jinx", win: true,
      })),
    ];
    await kv.put(KEYS.games("spadzze"), games.map((game) => JSON.stringify(game)).join("\n"));
    await kv.put(KEYS.gold("spadzze", "zeri"), JSON.stringify({ n_games: 6 }));
    await kv.put(KEYS.ref("challenger", "zeri"), JSON.stringify({ n_games: 100 }));
    const payload = (id: string) => ({ meta: {
      match_id: id, duration_min: 30, kda: { kills: 2, deaths: 2, assists: 2 },
      champion: "Zeri", role: "BOTTOM", win: false,
    } });
    await kv.put(KEYS.game_payloads("spadzze"), JSON.stringify({
      generated_at: "now", target: "challenger", max_games: 50,
      items: { z0: { payload_hash: "h", benchmark_scope: "adc", payload: payload("z0") } },
      unavailable: [],
    }));
    await kv.put(KEYS.reviews("spadzze"), JSON.stringify({
      ts: "2026-09-06", kind: "game", match_id: "z0", scope: "adc",
      payload: payload("z0"), run: { payload_hash: "old", prompt_version: "old" }, review: {},
    }) + "\n" + JSON.stringify({
      ts: "2026-09-05", scope: "adc", outcome_focus: "loss",
      run: { prompt_version: "old" }, payload: { meta: { scope: "adc" } }, review: {},
    }));

    const context = await buildCoachingContext(kv, "spadzze");
    expect(context.default_scope).toBe("adc");
    expect(context.scopes.map((scope: any) => scope.id)).toEqual(["all", "adc"]);
    expect(context.matches.z0).toMatchObject({ analyzable: true, review_status: "stale" });
    expect(context.review_samples.adc).toMatchObject({ available: 0, available_losses: 0 });
    expect(context.aggregate_status.adc.loss).toMatchObject({
      review_ts: "2026-09-05", needs_refresh: false, stale_prompt: true,
    });
  });
  it("classe ready une review CLI sans payload_hash mais au prompt courant", async () => {
    // Les reviews produites par `coach.py` ne portent pas de `payload_hash` :
    // seul le Worker en écrit un. Les traiter comme périmées invitait à repayer
    // une génération pour des reviews déjà validées.
    const kv = new MemoryKV();
    const games = ["cli", "hash-ko", "vieux"].map((id) => ({
      match_id: id, role: "BOTTOM", champion: "Zeri",
    }));
    await kv.put(KEYS.games("p"), games.map((game) => JSON.stringify(game)).join("\n"));
    const payload = (id: string) => ({ meta: { match_id: id, champion: "Zeri", role: "BOTTOM" } });
    await kv.put(KEYS.game_payloads("p"), JSON.stringify({
      generated_at: "now", target: "challenger", max_games: 50,
      items: Object.fromEntries(games.map(({ match_id }) => [match_id, {
        payload_hash: "courant", benchmark_scope: "adc", payload: payload(match_id),
      }])),
      unavailable: [],
    }));
    const current = await versionOf(SYSTEM_GAME);
    await kv.put(KEYS.reviews("p"), [
      // Review CLI : pas de `payload_hash`, prompt courant.
      { ts: "2026-09-05", kind: "game", match_id: "cli", scope: "adc",
        payload: payload("cli"), run: { prompt_version: current }, review: {} },
      // Review du Worker dont le payload a change depuis : le hash tranche.
      { ts: "2026-09-05", kind: "game", match_id: "hash-ko", scope: "adc",
        payload: payload("hash-ko"),
        run: { prompt_version: current, payload_hash: "perime" }, review: {} },
      // Review CLI d'une version de prompt anterieure : toujours perimee.
      { ts: "2026-09-05", kind: "game", match_id: "vieux", scope: "adc",
        payload: payload("vieux"), run: { prompt_version: "vieux" }, review: {} },
    ].map((review) => JSON.stringify(review)).join("\n"));

    const context = await buildCoachingContext(kv, "p");
    expect(context.matches.cli.review_status).toBe("ready");
    expect(context.matches["hash-ko"].review_status).toBe("stale");
    expect(context.matches.vieux.review_status).toBe("stale");
  });
});
