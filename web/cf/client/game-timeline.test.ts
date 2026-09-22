import { describe, expect, it } from "vitest";
import {
  PHASE_BANDS, axisMax, bandCounts, buildMarks, denseSpan, dominantCategory,
  dominantPhase, gamePhases, markPosition, parseTimestamps,
} from "./game-timeline";

describe("parseTimestamps", () => {
  it("extrait les horodatages du texte d'evidence", () => {
    const text = "14:16 Nunu dealt 1,029 damage (43.07% of the 2,389 damage you took); 16:12 Nunu dealt 954 damage";
    expect(parseTimestamps(text)).toEqual([
      { at: 14 + 16 / 60, label: "14:16" },
      { at: 16 + 12 / 60, label: "16:12" },
    ]);
  });

  it("ignore les nombres qui ne sont pas des horodatages", () => {
    // Les montants (1,029), les pourcentages (43.07%) et les ratios courts
    // (3:1) traversent les evidence : aucun ne doit devenir un point de frise.
    expect(parseTimestamps("1,029 damage, 43.07%, ratio 3:1, 120 CS")).toEqual([]);
  });

  it("dédoublonne et trie, parce qu'une evidence cite deux fois le même instant", () => {
    expect(parseTimestamps("23:07 puis 08:30, encore 23:07").map(item => item.label))
      .toEqual(["08:30", "23:07"]);
  });

  it("rend une liste vide sur une evidence absente", () => {
    expect(parseTimestamps(null)).toEqual([]);
    expect(parseTimestamps(undefined)).toEqual([]);
  });
});

describe("buildMarks", () => {
  const review = {
    strengths: [{ title: "Resets propres", category: "ECONOMIE_RECALL", evidence: "08:30 recall à 1450 g" }],
    mistakes: [
      { title: "Nunu dans 3 morts", category: "TRACKING_JUNGLE", evidence: "14:16 et 16:12" },
      { title: "Sans repli", category: "POSITIONNEMENT_COMBAT", evidence: "23:07" },
    ],
  };

  it("produit un repère par horodatage, trié dans l'ordre de la game", () => {
    const marks = buildMarks(review);
    expect(marks.map(mark => mark.label)).toEqual(["08:30", "14:16", "16:12", "23:07"]);
    expect(marks[0]).toMatchObject({ kind: "strength", index: 0, category: "ECONOMIE_RECALL" });
    expect(marks[1]).toMatchObject({ kind: "mistake", index: 0, title: "Nunu dans 3 morts" });
    expect(marks[3]).toMatchObject({ kind: "mistake", index: 1 });
  });

  it("ignore un insight sans horodatage plutôt que de le placer à zéro", () => {
    expect(buildMarks({ mistakes: [{ title: "Sans preuve datée", evidence: "souvent" }] })).toEqual([]);
  });

  it("survit à une review vide", () => {
    expect(buildMarks(null)).toEqual([]);
    expect(buildMarks({})).toEqual([]);
  });
});

describe("markPosition", () => {
  it("place le repère en pourcentage de la durée", () => {
    expect(markPosition(12, 24)).toBe(50);
  });

  it("borne les horodatages hors durée au lieu de les laisser déborder", () => {
    // Le LLM cite parfois un instant au-delà de la durée arrondie : le point
    // reste sur la frise, collé à l'extrémité.
    expect(markPosition(30, 24)).toBe(100);
    expect(markPosition(-2, 24)).toBe(0);
  });

  it("retombe à zéro sans durée exploitable", () => {
    expect(markPosition(12, 0)).toBe(0);
    expect(markPosition(12, null)).toBe(0);
  });
});

describe("dominantCategory", () => {
  it("désigne la catégorie la plus fréquente avec son compte", () => {
    expect(dominantCategory([
      { category: "TRACKING_JUNGLE" }, { category: "POSITIONNEMENT_COMBAT" }, { category: "TRACKING_JUNGLE" },
    ])).toEqual({ category: "TRACKING_JUNGLE", count: 2, total: 3 });
  });

  it("ne désigne rien quand aucune catégorie n'est portée", () => {
    expect(dominantCategory([{ point: "legacy" }])).toBeNull();
    expect(dominantCategory([])).toBeNull();
  });

  it("ne désigne personne quand rien ne se détache", () => {
    // Cas réel : une review de 5 erreurs porte souvent 5 catégories distinctes.
    // Servir la première ferait passer une égalité parfaite pour un dominant.
    expect(dominantCategory([{ category: "OBJECTIFS" }, { category: "TRADE_LANE" }])).toBeNull();
    expect(dominantCategory([
      { category: "OBJECTIFS" }, { category: "OBJECTIFS" }, { category: "TRADE_LANE" },
    ])?.category).toBe("OBJECTIFS");
  });
});

describe("gamePhases", () => {
  const marks = [
    { kind: "mistake", at: 2 }, { kind: "mistake", at: 14 }, { kind: "mistake", at: 16 },
    { kind: "mistake", at: 23 }, { kind: "strength", at: 22 },
  ] as any;

  it("répartit les erreurs en trois tiers de game", () => {
    // Tiers de [0,8[, [8,16[, [16,24] : 16:00 ouvre le dernier tiers.
    expect(gamePhases(marks, 24)).toEqual({ early: 1, mid: 1, late: 2 });
  });

  it("ne compte que les erreurs : une force n'est pas un problème de phase", () => {
    expect(gamePhases([{ kind: "strength", at: 22 }] as any, 24)).toEqual({ early: 0, mid: 0, late: 0 });
  });

  it("rend null sans durée exploitable", () => {
    expect(gamePhases(marks, 0)).toBeNull();
  });

  it("désigne la phase dominante seulement si elle se détache", () => {
    expect(dominantPhase(marks, 24)).toBe("late");
    // Deux tiers à égalité : rien à dire, on se tait plutôt que d'inventer.
    expect(dominantPhase([{ kind: "mistake", at: 2 }, { kind: "mistake", at: 22 }] as any, 24)).toBeNull();
    expect(dominantPhase([], 24)).toBeNull();
  });
});

describe("bandes de phase", () => {
  // Distribution réelle mesurée sur les 12 reviews publiées de Spadzze.
  const moments = [
    ...Array.from({ length: 6 }, () => ({ at: 3, kind: "mistake" as const })),
    ...Array.from({ length: 3 }, () => ({ at: 3, kind: "strength" as const })),
    ...Array.from({ length: 55 }, () => ({ at: 9, kind: "mistake" as const })),
    ...Array.from({ length: 19 }, () => ({ at: 9, kind: "strength" as const })),
    ...Array.from({ length: 58 }, () => ({ at: 20, kind: "mistake" as const })),
    ...Array.from({ length: 23 }, () => ({ at: 20, kind: "strength" as const })),
    ...Array.from({ length: 21 }, () => ({ at: 30, kind: "mistake" as const })),
    ...Array.from({ length: 7 }, () => ({ at: 30, kind: "strength" as const })),
  ];

  it("découpe en minutes absolues, pas en tiers relatifs", () => {
    // Agréger N parties de durées différentes interdit le tiers relatif :
    // la 12e minute d'une game de 24 min et d'une de 40 min est la même
    // phase de jeu, pas le même tiers.
    expect(PHASE_BANDS.map(band => [band.from, band.to])).toEqual([
      [0, 5], [5, 15], [15, 25], [25, Infinity],
    ]);
  });

  it("compte erreurs et forces par bande", () => {
    expect(bandCounts(moments).map(band => [band.key, band.mistakes, band.strengths])).toEqual([
      ["very_early", 6, 3], ["laning", 55, 19], ["mid", 58, 23], ["late", 21, 7],
    ]);
  });

  it("rend la plus courte fenêtre contiguë qui tient la majorité des erreurs", () => {
    // 55 et 58 sont à égalité de fait : nommer « le mid domine » serait faux.
    // La concentration, elle, est toujours définie et toujours vraie.
    expect(denseSpan(bandCounts(moments))).toEqual({
      fromMin: 5, toMin: 25, count: 113, total: 140,
    });
  });

  it("se resserre sur une seule bande quand elle suffit", () => {
    const concentrated = [
      ...Array.from({ length: 8 }, () => ({ at: 20, kind: "mistake" as const })),
      { at: 3, kind: "mistake" as const }, { at: 30, kind: "mistake" as const },
    ];
    expect(denseSpan(bandCounts(concentrated))).toEqual({
      fromMin: 15, toMin: 25, count: 8, total: 10,
    });
  });

  it("laisse la dernière bande ouverte", () => {
    const late = Array.from({ length: 5 }, () => ({ at: 31, kind: "mistake" as const }));
    expect(denseSpan(bandCounts(late))).toEqual({ fromMin: 25, toMin: null, count: 5, total: 5 });
  });

  it("ne dit rien sans erreur à situer", () => {
    expect(denseSpan(bandCounts([{ at: 9, kind: "strength" }]))).toBeNull();
    expect(denseSpan(bandCounts([]))).toBeNull();
  });

  it("étend l'axe au-delà du dernier instant, par paliers de cinq minutes", () => {
    expect(axisMax([{ at: 39.6, kind: "mistake" }])).toBe(40);
    expect(axisMax([{ at: 12, kind: "mistake" }])).toBe(30);
    expect(axisMax([])).toBe(30);
  });
});
