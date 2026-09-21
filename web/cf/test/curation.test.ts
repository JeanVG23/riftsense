import { describe, expect, it } from "vitest";
import { pedagogicTarget } from "../src/curation";

const game = (overrides: Record<string, unknown> = {}) => ({
  match_id: "m1", win: false, duration_min: 22,
  kills: [{ minute: 1 }], assists: [{}, {}],
  lane: { gd14: -500, csd14: 0, opponent: "Jinx" },
  ...overrides,
});

describe("pedagogicTarget", () => {
  it("applique toutes les frontières d'une défaite pédagogique", () => {
    expect(pedagogicTarget(game())?.kind).toBe("loss");
    expect(pedagogicTarget(game({ duration_min: 21.99 }))).toBeNull();
    expect(pedagogicTarget(game({ lane: { gd14: -501 } }))).toBeNull();
    expect(pedagogicTarget(game({ kills: 1, assists: 1 }))).toBeNull();
    expect(pedagogicTarget(game({ lane: {} }))).toBeNull();
  });

  it("n'affirme une avance que pour un GD14 positif", () => {
    expect(pedagogicTarget(game())?.hint).toContain("competitive");
    expect(pedagogicTarget(game({ lane: { gd14: 800 } }))?.hint).toContain("+800");
  });

  it("applique durée, participation et adversaire observable à une victoire", () => {
    const win = game({ win: true, duration_min: 24 });
    expect(pedagogicTarget(win)?.kind).toBe("win");
    expect(pedagogicTarget({ ...win, duration_min: 23.99 })).toBeNull();
    expect(pedagogicTarget({ ...win, lane: { csd14: 0 } })).toBeNull();
    expect(pedagogicTarget({ ...win, lane: { opponent: "Jinx" } })).toBeNull();
  });

  it("lit durée et KDA dans le payload si le silver ne les porte pas", () => {
    const silver = { win: true, lane: { opponent: "Jinx", csd14: 0 } };
    const payload = { meta: { duration_min: 30, kda: { kills: 2, assists: 3 } } };
    expect(pedagogicTarget(silver, payload)?.kind).toBe("win");
  });
});
