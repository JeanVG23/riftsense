import { describe, expect, it } from "vitest";
import {
  featureCatalogKeys,
  featurePresentation,
  formatFeatureValue,
  themeLabel,
  THEME_ORDER,
} from "./feature-catalog";

describe("feature catalog", () => {
  it("says what an aggregation means instead of naming it", () => {
    expect(featurePresentation("csm10__p50", "csm10")).toMatchObject({
      displayLabel: "CS per minute at 10 minutes, in a typical game",
      unit: "CS/min",
      technicalName: "csm10__p50",
    });
  });

  it("describes percentiles as extremes of the window, never as good or bad", () => {
    // p10 is the low end of the metric, which is the BEST games for deaths and
    // the WORST games for farming. Wording that judged the game would be false
    // for half the catalog.
    expect(featurePresentation("csm10__p10", "csm10").aggregationLabel).toBe("at your lowest");
    expect(featurePresentation("deaths_late__p90", "deaths_late").aggregationLabel).toBe("at your highest");
    expect(featurePresentation("deaths_late__std", "deaths_late").aggregationLabel).toBe("swing between games");
    expect(featurePresentation("csm10__mean", "csm10").aggregationLabel).toBe("on average");
  });

  it("recovers the catalog base when an older payload omitted it", () => {
    expect(featurePresentation("csm10__mean", "csm10__mean").displayLabel)
      .toBe("CS per minute at 10 minutes, on average");
  });

  it("carries the theme that groups the feature on the profile page", () => {
    expect(featurePresentation("csm10__mean", "csm10").theme).toBe("economy");
    expect(featurePresentation("pos_wards_killed__p90", "pos_wards_killed").theme).toBe("vision");
    expect(featurePresentation("deaths_late__std", "deaths_late").theme).toBe("fights");
  });

  it("files an unknown future feature under game context rather than inventing a theme", () => {
    expect(featurePresentation("new_signal__std", "new_signal")).toMatchObject({
      displayLabel: "New signal, swing between games",
      description: "No plain-English definition is available yet.",
      technicalName: "new_signal__std",
      theme: "context",
    });
  });

  it("names every theme it can return", () => {
    expect(THEME_ORDER.map(themeLabel)).toEqual([
      "Farm & economy",
      "Positioning & map",
      "Vision",
      "Fights & survival",
      "Objectives",
      "Game context",
    ]);
  });

  it("formats percentages from the stored zero-to-one ratio", () => {
    expect(formatFeatureValue(0.573, "%")).toBe("57.3%");
    expect(formatFeatureValue(7.34, "CS/min")).toBe("7.34 CS/min");
  });

  it("contains no empty catalog", () => {
    expect(featureCatalogKeys().length).toBeGreaterThan(40);
  });
});
