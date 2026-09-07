import { describe, expect, it } from "vitest";
import { buildCoachingContext } from "../src/coaching_context";
import { KEYS, type KVLike } from "../src/readers";

class MemoryKV implements KVLike {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

describe("buildCoachingContext", () => {
  it("calcule le top champion sur tout l'historique sans compter les reviews", async () => {
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
    for (const scope of ["zeri", "jinx"]) {
      await kv.put(KEYS.gold("spadzze", scope), JSON.stringify({ n_games: 1 }));
      await kv.put(KEYS.ref("challenger", scope), JSON.stringify({ n_games: 100 }));
    }
    const payload = (id: string) => ({ meta: {
      match_id: id, duration_min: 30, kda: { kills: 2, deaths: 2, assists: 2 },
      champion: "Zeri", role: "BOTTOM", win: false,
    } });
    await kv.put(KEYS.game_payloads("spadzze"), JSON.stringify({
      generated_at: "now", target: "challenger", max_games: 50,
      items: { z0: { payload_hash: "h", benchmark_scope: "zeri", payload: payload("z0") } },
      unavailable: [],
    }));
    await kv.put(KEYS.reviews("spadzze"), JSON.stringify({
      ts: "2026-09-06", kind: "game", match_id: "z0", scope: "zeri",
      payload: payload("z0"), run: { payload_hash: "old", prompt_version: "old" }, review: {},
    }) + "\n" + JSON.stringify({
      ts: "2026-09-05", scope: "zeri", outcome_focus: "loss",
      run: { prompt_version: "old" }, payload: { meta: { scope: "zeri" } }, review: {},
    }));

    const context = await buildCoachingContext(kv, "spadzze");
    expect(context.default_scope).toBe("zeri");
    expect(context.scopes.find((scope: any) => scope.id === "zeri"))
      .toMatchObject({ label: "⭐ Zeri (6)", rawLabel: "Zeri", n_games: 6, share: 0.6 });
    expect(context.scopes.map((scope: any) => scope.id)).toEqual(["all", "adc", "zeri"]);
    expect(context.scopes.some((scope: any) => scope.id === "jinx")).toBe(false);
    expect(context.matches.z0).toMatchObject({ analyzable: true, review_status: "stale" });
    expect(context.review_samples.zeri).toMatchObject({ available: 1, available_losses: 1 });
    expect(context.aggregate_status.zeri.loss).toMatchObject({
      review_ts: "2026-09-05", needs_refresh: true, stale_prompt: true,
    });
  });

  it("retombe sur adc si le champion est sous 40% ou sans agrégat", async () => {
    const kv = new MemoryKV();
    const games = Array.from({ length: 6 }, (_, i) => ({
      match_id: `m${i}`, role: "BOTTOM", champion: i < 2 ? "Zeri" : `Champ${i}`,
    }));
    await kv.put(KEYS.games("p"), games.map((game) => JSON.stringify(game)).join("\n"));
    expect((await buildCoachingContext(kv, "p")).default_scope).toBe("adc");
  });

  it("n'affiche jamais plus de deux champions suffisamment joués", async () => {
    const kv = new MemoryKV();
    const counts = [["Zeri", 10], ["Aphelios", 8], ["Kaisa", 6]] as const;
    const games = counts.flatMap(([champion, count]) =>
      Array.from({ length: count }, (_, i) => ({
        match_id: `${champion}-${i}`, role: "BOTTOM", champion,
      })),
    );
    await kv.put(KEYS.games("p"), games.map((game) => JSON.stringify(game)).join("\n"));
    for (const [champion] of counts) {
      const scope = champion.toLowerCase();
      await kv.put(KEYS.gold("p", scope), JSON.stringify({ n_games: 1 }));
      await kv.put(KEYS.ref("challenger", scope), JSON.stringify({ n_games: 100 }));
    }

    const context = await buildCoachingContext(kv, "p");
    expect(context.scopes.map((scope: any) => scope.id))
      .toEqual(["all", "adc", "zeri", "aphelios"]);
    expect(context.scopes.map((scope: any) => scope.label))
      .toEqual(["Toutes", "ADC", "⭐ Zeri (10)", "Aphelios (8)"]);
  });
});
