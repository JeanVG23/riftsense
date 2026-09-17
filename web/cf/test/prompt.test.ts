import { describe, expect, it } from "vitest";
import { render, renderGame, SYSTEM, SYSTEM_GAME, versionOf } from "../src/prompt";

describe("prompt", () => {
  it("SYSTEM porte les règles d'asymétrie et de benchmark", () => {
    expect(SYSTEM).toContain("ASYMÉTRIE");
    expect(SYSTEM).toContain("BENCHMARK-RELATIF");
    expect(SYSTEM).toContain("game_review_causes");
    expect(SYSTEM).toContain("INTERDICTION");
    expect(SYSTEM.length).toBeGreaterThan(500);
  });

  it("garde la même version que le prompt Python", async () => {
    expect(await versionOf(SYSTEM)).toBe("ba5a8458369c");
  });

  it("render(payload) sérialise le contexte utilisateur", () => {
    const payload = {
      meta: {
        n_games_me: 18,
        scope: "adc",
        outcome_focus: "loss",
        target: "challenger",
      },
      signals: [],
    };
    const [system, user] = render(payload);
    expect(system).toBe(SYSTEM);
    expect(user).toContain("Signaux de tes 18 dernières games");
    expect(user).toContain("adc");
    expect(user).toContain("challenger");
    expect(user).toContain(JSON.stringify(payload, undefined, 2));
    expect(user.trimEnd().endsWith("Produis la review.")).toBe(true);
  });
});

describe("prompt par partie", () => {
  it("porte les règles d'ancrage, asymétrie et recalls", async () => {
    expect(SYSTEM_GAME).toContain("ASYMÉTRIE");
    expect(SYSTEM_GAME).toContain("mm:ss");
    expect(SYSTEM_GAME).toContain("cheapest_item_cost");
    expect(await versionOf(SYSTEM_GAME)).toBe("350f7c404b5b");
  });

  it("sérialise la partie et son issue", () => {
    const payload = { meta: {
      match_id: "EUW1_42", champion: "Zeri", opponent: "Jinx", role: "BOTTOM",
      win: false, duration_min: 30, target: "challenger",
    }, journal: { deaths: [], recalls: [] } };
    const [system, user] = renderGame(payload);
    expect(system).toBe(SYSTEM_GAME);
    expect(user).toContain("EUW1_42");
    expect(user).toContain("défaite");
    expect(user).toContain(JSON.stringify(payload, undefined, 2));
  });
});
