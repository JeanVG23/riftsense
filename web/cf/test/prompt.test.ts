import { describe, expect, it } from "vitest";
import { render, renderGame, SYSTEM, SYSTEM_GAME, versionOf } from "../src/prompt";

describe("prompt", () => {
  it("SYSTEM porte les règles d'asymétrie et de benchmark", () => {
    expect(SYSTEM).toContain("INFORMATION ASYMMETRY");
    expect(SYSTEM).toContain("BENCHMARK-RELATIVE");
    expect(SYSTEM).toContain("game_review_causes");
    expect(SYSTEM).toContain("NEVER");
    expect(SYSTEM.length).toBeGreaterThan(500);
  });

  it("garde la même version que le prompt Python", async () => {
    expect(await versionOf(SYSTEM)).toBe("280fff44c0f2");
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
    expect(user).toContain("Signals from your latest 18 games");
    expect(user).toContain("adc");
    expect(user).toContain("challenger");
    expect(user).toContain(JSON.stringify(payload, undefined, 2));
    expect(user.trimEnd().endsWith("Produce the review.")).toBe(true);
  });
});

describe("prompt par partie", () => {
  it("porte les règles d'ancrage, asymétrie et recalls", async () => {
    expect(SYSTEM_GAME).toContain("INFORMATION ASYMMETRY");
    expect(SYSTEM_GAME).toContain("mm:ss");
    expect(SYSTEM_GAME).toContain("cheapest_item_cost");
    expect(SYSTEM_GAME).toContain("every number in every output field");
    expect(await versionOf(SYSTEM_GAME)).toBe("07692894c681");
  });

  it("sérialise la partie et son issue", () => {
    const payload = { meta: {
      match_id: "EUW1_42", champion: "Zeri", opponent: "Jinx", role: "BOTTOM",
      win: false, duration_min: 30, target: "challenger",
    }, journal: { deaths: [], recalls: [] } };
    const [system, user] = renderGame(payload);
    expect(system).toBe(SYSTEM_GAME);
    expect(user).toContain("EUW1_42");
    expect(user).toContain("loss");
    expect(user).toContain(JSON.stringify(payload, undefined, 2));
  });
});
