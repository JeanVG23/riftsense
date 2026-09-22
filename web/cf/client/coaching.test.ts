import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS, categoryLabel, insightBody, insightDetail, insightHeading,
  insightTitle, outcomeLabel,
} from "./coaching";

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

describe("structured game insights", () => {
  it("préfère le vrai titre et garde le point comme détail", () => {
    const item = { title: "Recall tardif", point: "Recall avant le drake plutôt qu'après." };
    expect(insightHeading(item)).toBe("Recall tardif");
    expect(insightDetail(item)).toBe(item.point);
  });

  it("retombe sur le découpage historique sans titre", () => {
    const item = { point: "Back trop tardif : vague perdue" };
    expect(insightHeading(item)).toBe("Back trop tardif");
    expect(insightDetail(item)).toBe("vague perdue");
  });

  it("traduit toute la taxonomie fermée", () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(9);
    expect(categoryLabel("TRACKING_JUNGLE")).toBe("Jungle tracking");
    expect(categoryLabel("CUSTOM")).toBe("CUSTOM");
  });
});
