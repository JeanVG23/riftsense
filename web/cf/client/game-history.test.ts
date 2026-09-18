import { describe, expect, it } from "vitest";
import {
  combatEvents,
  formatFullDate,
  formatGameDate,
  formatKda,
  objectiveLabel,
  sideSummary,
  type GameSummary,
} from "./game-history";

const game: GameSummary = {
  match_id: "EUW1_42",
  champion: "Kai'Sa",
  win: false,
  kills: [{ minute: 8, victim_champ: "Jinx", is_solo: true }],
  deaths: [{ minute: 4, killer_champ: "Nautilus" }],
  assists: [{ minute: 8, victim_champ: "Jinx", killer_champ: "Leona" }],
};

describe("game history formatters", () => {
  it("formate le KDA depuis les journaux détaillés", () => {
    expect(formatKda(game)).toBe("1/1/1 · 2.00");
  });

  it("trie les combats puis applique le filtre", () => {
    expect(combatEvents(game, "all").map((event) => event.type)).toEqual([
      "death", "kill", "assist",
    ]);
    expect(combatEvents(game, "kill")).toHaveLength(1);
  });

  it("conserve les libellés pédagogiques des objectifs et des sides", () => {
    expect(objectiveLabel({ type: "DRAGON", sub_type: "FIRE_DRAGON", minute: 12 })).toBe("Dragon Infernal");
    expect(sideSummary({
      ...game,
      sides: { ally_start: "BLUE", enemy_start: "RED", ally_weakside: "BOT", enemy_weakside: "BOT" },
    })).toContain("Double Weakside bot");
  });

  it("formate la date de partie et la date complète", () => {
    // 1786379613694 -> 10 août 2026
    const ts = 1786379613694;
    expect(formatGameDate(ts)).toContain("10 août 2026");
    expect(formatFullDate(ts)).toContain("10 août 2026");
    expect(formatGameDate(null)).toBe("");
    expect(formatGameDate(undefined)).toBe("");
    expect(formatGameDate("invalide")).toBe("");
  });
});
