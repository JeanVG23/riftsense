import { describe, expect, it } from "vitest";
import { insightBody, insightTitle, outcomeLabel } from "./coaching";

describe("coaching helpers", () => {
  it("sépare un titre d'insight de son explication", () => {
    expect(insightTitle("Erreur 2 : Back trop tardif — vague perdue")).toBe("Back trop tardif");
    expect(insightBody("Erreur 2 : Back trop tardif — vague perdue")).toBe("vague perdue");
  });

  it("presents outcomes in English", () => {
    expect(outcomeLabel("loss")).toBe("Losses");
    expect(outcomeLabel("win")).toBe("Wins");
    expect(outcomeLabel("overall")).toBe("Overall");
  });
});
