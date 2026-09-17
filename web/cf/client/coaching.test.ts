import { describe, expect, it } from "vitest";
import { insightBody, insightTitle, outcomeLabel } from "./coaching";

describe("coaching helpers", () => {
  it("sépare un titre d'insight de son explication", () => {
    expect(insightTitle("Erreur 2 : Back trop tardif — vague perdue")).toBe("Back trop tardif");
    expect(insightBody("Erreur 2 : Back trop tardif — vague perdue")).toBe("vague perdue");
  });

  it("présente les issues en français", () => {
    expect(outcomeLabel("loss")).toBe("Défaites");
    expect(outcomeLabel("win")).toBe("Victoires");
    expect(outcomeLabel("overall")).toBe("Global");
  });
});
