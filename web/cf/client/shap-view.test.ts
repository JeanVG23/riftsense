import { describe, expect, it } from "vitest";
import type { RoleDriver } from "./role-analysis";
import {
  GAUGE_MAX_LOGIT,
  formatContribution,
  directionHint,
  directionSense,
  gaugeOffset,
  groupByBase,
  groupByTheme,
  pickHighlights,
  verdictLine,
} from "./shap-view";

function driver(overrides: Partial<RoleDriver> & { feature: string }): RoleDriver {
  const [base] = overrides.feature.split("__", 1);
  return {
    base,
    value: 1,
    contribution: 0,
    crossover_value: null,
    direction: "valeur haute → apex",
    category: "actionable",
    ...overrides,
  };
}

describe("groupByBase", () => {
  it("nets every aggregation of one metric into a single row", () => {
    const groups = groupByBase([
      driver({ feature: "csm10__mean", contribution: 0.3 }),
      driver({ feature: "csm10__p10", contribution: -0.1 }),
      driver({ feature: "deaths_late__std", contribution: -0.5 }),
    ]);

    expect(groups.map((group) => group.base)).toEqual(["deaths_late", "csm10"]);
    expect(groups[0].net).toBeCloseTo(-0.5, 10);
    expect(groups[1].net).toBeCloseTo(0.2, 10);
    expect(groups[1].label).toBe("CS per minute at 10 minutes");
  });

  it("keeps the aggregations inside the group, strongest first", () => {
    const [group] = groupByBase([
      driver({ feature: "csm10__p90", contribution: 0.05 }),
      driver({ feature: "csm10__mean", contribution: -0.4 }),
    ]);

    expect(group.parts.map((part) => part.aggregationLabel))
      .toEqual(["on average", "at your highest"]);
    expect(group.parts[0].contribution).toBeCloseTo(-0.4, 10);
  });

  it("leads with the aggregation that explains the net, not the heaviest one", () => {
    // Quatre métriques sur 39 dans la fenêtre de Spadzze : l'agrégation la
    // plus lourde est de signe opposé au net. Lire la ligne sur celle-là
    // expliquerait l'inverse de ce que le chiffre affiché annonce.
    const [group] = groupByBase([
      driver({ feature: "pos_avg_map_depth__std", contribution: 0.074 }),
      driver({ feature: "pos_avg_map_depth__mean", contribution: -0.06 }),
      driver({ feature: "pos_avg_map_depth__p90", contribution: -0.068 }),
    ]);

    expect(group.net).toBeCloseTo(-0.054, 10);
    expect(group.parts[0].feature).toBe("pos_avg_map_depth__std");
    expect(group.lead?.feature).toBe("pos_avg_map_depth__p90");
  });

  it("retombe sur l'agrégation la plus lourde quand aucune ne porte le signe", () => {
    const [group] = groupByBase([
      driver({ feature: "csm10__mean", contribution: 0 }),
      driver({ feature: "csm10__p10", contribution: 0 }),
    ]);

    expect(group.lead?.feature).toBe("csm10__mean");
  });

  it("carries the theme of the metric so the page can section the rows", () => {
    const [group] = groupByBase([driver({ feature: "pos_wards_killed__mean", contribution: 0.2 })]);

    expect(group.theme).toBe("vision");
  });

  it("treats a metric as a lever only when every published part is actionable", () => {
    // La catégorie est décidée par base côté service, donc jamais mixte en
    // pratique. Si elle le devenait, le repli conservateur est « contexte » :
    // la classe qui ne se formule jamais en levier.
    const [group] = groupByBase([
      driver({ feature: "frac_behind__mean", contribution: 0.2, category: "actionable" }),
      driver({ feature: "frac_behind__p90", contribution: 0.1, category: "descriptive" }),
    ]);

    expect(group.actionable).toBe(false);
  });
});

describe("groupByTheme", () => {
  it("sums the themes present in the window, in page order", () => {
    const themes = groupByTheme([
      driver({ feature: "pos_wards_killed__mean", contribution: 0.2 }),
      driver({ feature: "csm10__mean", contribution: -0.5 }),
      driver({ feature: "gpm10__mean", contribution: -0.1 }),
    ]);

    expect(themes.map((theme) => theme.theme)).toEqual(["economy", "vision"]);
    expect(themes[0]).toMatchObject({ label: "Farm & economy" });
    expect(themes[0].net).toBeCloseTo(-0.6, 10);
    expect(themes[1].net).toBeCloseTo(0.2, 10);
  });

  it("leaves out a theme with no published metric rather than drawing an empty row", () => {
    const themes = groupByTheme([driver({ feature: "csm10__mean", contribution: 0.4 })]);

    expect(themes).toHaveLength(1);
  });
});

describe("verdictLine", () => {
  it("names the heaviest area of each sign, in one sentence", () => {
    const line = verdictLine(groupByTheme([
      driver({ feature: "csm10__mean", contribution: -0.4 }),
      driver({ feature: "pos_avg_map_depth__mean", contribution: -0.7 }),
      driver({ feature: "pos_wards_killed__mean", contribution: 0.3 }),
    ]));

    expect(line).toBe(
      "Positioning & map weighs most against your score; Vision is where the model credits you most.",
    );
  });

  it("drops the clause that has no area to name", () => {
    const only = groupByTheme([driver({ feature: "csm10__mean", contribution: -0.4 })]);

    expect(verdictLine(only)).toBe("Farm & economy weighs most against your score.");
  });

  // Une phrase générée ne doit jamais prescrire : elle lit la décomposition
  // publiée. Un thème agrège des métriques `descriptive`, donc « weighs
  // against your score » est le plus loin qu'on puisse aller sans transformer
  // du contexte en consigne.
  it("says nothing when the window carries no weight at all", () => {
    expect(verdictLine([])).toBeNull();
    expect(verdictLine(groupByTheme([driver({ feature: "csm10__mean", contribution: 0 })]))).toBeNull();
  });
});

describe("pickHighlights", () => {
  it("reads strengths and levers from actionable metrics only", () => {
    const groups = groupByBase([
      driver({ feature: "frac_behind__mean", contribution: -0.9, category: "descriptive" }),
      driver({ feature: "deaths_late__std", contribution: -0.5 }),
      driver({ feature: "gpm10__mean", contribution: -0.2 }),
      driver({ feature: "pos_wards_killed__p90", contribution: 0.4 }),
      driver({ feature: "kills_2v2__mean", contribution: 0.1 }),
    ]);
    const { strengths, levers } = pickHighlights(groups);

    expect(levers.map((group) => group.base)).toEqual(["deaths_late", "gpm10"]);
    expect(strengths.map((group) => group.base)).toEqual(["pos_wards_killed", "kills_2v2"]);
  });

  it("keeps at most three of each", () => {
    const groups = groupByBase(Array.from({ length: 8 }, (_, index) =>
      driver({ feature: `metric_${index}__mean`, contribution: index % 2 ? index : -index })));
    const { strengths, levers } = pickHighlights(groups);

    expect(strengths).toHaveLength(3);
    expect(levers).toHaveLength(3);
  });
});

describe("direction", () => {
  it("translates the published sense into a stable enum", () => {
    expect(directionSense("valeur haute → apex")).toBe("higher-closer");
    expect(directionSense("valeur haute → sous-apex")).toBe("higher-farther");
    expect(directionSense("indéterminé (colonne constante)")).toBe("unknown");
    expect(directionSense(null)).toBe("unknown");
  });

  it("words each sense in the language of the page", () => {
    expect(directionHint("higher-closer")).toBe("Higher moves you toward the apex");
    expect(directionHint("higher-farther")).toBe("Lower moves you toward the apex");
    expect(directionHint("unknown")).toBe("No consistent direction in this window");
  });
});

describe("gaugeOffset", () => {
  it("puts the model boundary in the middle", () => {
    expect(gaugeOffset(0)).toBe(50);
  });

  it("places a score proportionally on the shown scale", () => {
    expect(gaugeOffset(-GAUGE_MAX_LOGIT / 2)).toBeCloseTo(25, 10);
    expect(gaugeOffset(GAUGE_MAX_LOGIT)).toBe(100);
  });

  it("clamps a score beyond the shown scale instead of leaving the track", () => {
    expect(gaugeOffset(-GAUGE_MAX_LOGIT * 4)).toBe(0);
    expect(gaugeOffset(GAUGE_MAX_LOGIT * 4)).toBe(100);
  });
});

describe("formatContribution", () => {
  it("carries the sign, because the sign is the whole reading", () => {
    expect(formatContribution(0.2)).toBe("+0.20");
    expect(formatContribution(-0.605)).toBe("-0.60");
  });

  it("never prints a negative zero when aggregations cancel out", () => {
    // pos_frac_enemy_half publie quatre agrégations qui se compensent : la
    // somme flottante vaut -1.4e-17, et un affichage naïf rendrait « -0.00 ».
    expect(formatContribution(-1.3877787807814457e-17)).toBe("+0.00");
  });
});
