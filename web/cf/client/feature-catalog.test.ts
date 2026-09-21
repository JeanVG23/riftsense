import { describe, expect, it } from "vitest";
import {
  featureCatalogKeys,
  featurePresentation,
  formatFeatureValue,
  wrapTooltipText,
} from "./feature-catalog";

describe("feature catalog", () => {
  it("combines a plain-English base label with the aggregation", () => {
    expect(featurePresentation("csm10__p50", "csm10")).toMatchObject({
      displayLabel: "CS per minute at 10 minutes — median",
      unit: "CS/min",
      technicalName: "csm10__p50",
    });
  });

  it("recovers the catalog base when an older payload omitted it", () => {
    expect(featurePresentation("csm10__mean", "csm10__mean").displayLabel)
      .toBe("CS per minute at 10 minutes — average");
  });

  it("keeps future unknown identifiers readable without hiding the technical name", () => {
    expect(featurePresentation("new_signal__std", "new_signal")).toMatchObject({
      displayLabel: "New signal — variation",
      description: "No plain-English definition is available yet.",
      technicalName: "new_signal__std",
    });
  });

  it("formats percentages from the stored zero-to-one ratio", () => {
    expect(formatFeatureValue(0.573, "%")).toBe("57.3%");
    expect(formatFeatureValue(7.34, "CS/min")).toBe("7.34 CS/min");
  });

  it("wraps long tooltip definitions without losing words", () => {
    const description = "A deliberately long definition that must remain readable on narrow screens.";
    const lines = wrapTooltipText("Definition:", description, 35);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(`Definition: ${description}`);
    expect(lines.every((line) => line.length <= 35)).toBe(true);
  });

  it("contains no empty catalog", () => {
    expect(featureCatalogKeys().length).toBeGreaterThan(40);
  });
});
