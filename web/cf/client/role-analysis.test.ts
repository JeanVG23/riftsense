import { describe, expect, it } from "vitest";
import {
  REASON_MESSAGES,
  boundaryLabel,
  formatLogit,
  parseRoleAnalysis,
  reasonMessage,
  roleLabel,
  ROLE_LABELS,
} from "./role-analysis";

describe("parseRoleAnalysis", () => {
  it("repli not_ingested sur valeur absente ou invalide", () => {
    expect(parseRoleAnalysis(null)).toEqual({ available: false, reason: "not_ingested" });
    expect(parseRoleAnalysis(undefined)).toEqual({ available: false, reason: "not_ingested" });
    expect(parseRoleAnalysis("spadzze")).toEqual({ available: false, reason: "not_ingested" });
    expect(parseRoleAnalysis({})).toEqual({ available: false, reason: "not_ingested" });
  });

  it("préserve le motif servi, avec repli sur not_ingested s'il est vide", () => {
    expect(parseRoleAnalysis({ available: false, reason: "role_closed" }))
      .toEqual({ available: false, reason: "role_closed" });
    expect(parseRoleAnalysis({ available: false, reason: "" }))
      .toEqual({ available: false, reason: "not_ingested" });
    expect(parseRoleAnalysis({ available: false }))
      .toEqual({ available: false, reason: "not_ingested" });
  });

  it("normalise un payload disponible et écarte les drivers malformés", () => {
    const payload = parseRoleAnalysis({
      schema_version: 1,
      generated_at: "2026-09-19T10:00:00Z",
      available: true,
      role: "JUNGLE",
      model: { model_id: "jungle-ebm", boundary: "diamond", auc_heldout_median: 0.83, n_seeds: 10 },
      sample: { role_games_used: 20 },
      intercept: -1.2,
      logit: 0.62,
      drivers: [
        { feature: "csm10__mean", base: "csm10", value: 7.3, contribution: 0.21,
          crossover_value: 7.14, direction: "valeur haute → apex", category: "actionable" },
        { feature: "casse", base: "casse", contribution: "pas un nombre" },
        { feature: "", base: "", contribution: 0.1, category: "descriptive" },
        { feature: "ward_coverage__mean", contribution: -0.05, category: "n_importe_quoi" },
      ],
    });
    expect(payload.available).toBe(true);
    if (!payload.available) return;
    expect(payload.role).toBe("JUNGLE");
    expect(payload.logit).toBe(0.62);
    expect(payload.drivers).toHaveLength(2);
    expect(payload.drivers[0]).toMatchObject({
      feature: "csm10__mean", base: "csm10", category: "actionable", crossover_value: 7.14, value: 7.3,
    });
    // Catégorie inconnue repliée en descriptive : le sens conservateur est
    // « jamais formulée en levier », jamais l'inverse. Base absente du wire :
    // repli sur le nom complet, jamais sur une valeur fabriquée.
    expect(payload.drivers[1]).toMatchObject({
      feature: "ward_coverage__mean", base: "ward_coverage__mean", category: "descriptive",
    });
  });
});

describe("libellés et messages", () => {
  it("traduit chaque rôle servi par le service", () => {
    expect(ROLE_LABELS).toEqual({
      TOP: "Toplane", JUNGLE: "Jungle", MIDDLE: "Midlane", BOTTOM: "Botlane", SUPPORT: "Support",
    });
    expect(roleLabel("MIDDLE")).toBe("Midlane");
    expect(roleLabel(null)).toBe("rôle inconnu");
  });

  it("couvre exactement les 9 motifs connus, service et client", () => {
    expect(Object.keys(REASON_MESSAGES).sort()).toEqual([
      "collection_incomplete", "fetch_failed", "model_mismatch", "model_missing",
      "not_ingested", "rank_out_of_scope", "role_closed", "scoring_failed",
      "window_too_short",
    ]);
  });

  it("chaque motif d'indisponibilité a son message typé", () => {
    expect(reasonMessage("role_closed"))
      .toBe("L'analyse ML pour ce rôle n'est pas encore ouverte au public.");
    expect(reasonMessage("window_too_short"))
      .toBe("Moins de 20 parties sur ton rôle principal : la décomposition exige une fenêtre de 20.");
    expect(reasonMessage("fetch_failed"))
      .toBe("L'analyse n'a pas pu être chargée ; recharge la page et réessaie.");
  });

  it("un motif inconnu reste visible, jamais masqué par un message générique", () => {
    expect(reasonMessage("nouveau_motif_v7"))
      .toBe("Analyse indisponible (motif : nouveau_motif_v7)");
  });

  it("formate la frontière et le logit signé, sans aucune conversion", () => {
    expect(boundaryLabel("diamond")).toBe("Diamond ↔ GM+");
    expect(formatLogit(1.234)).toBe("+1.23");
    expect(formatLogit(-0.5)).toBe("-0.50");
    expect(formatLogit(0)).toBe("0.00");
    expect(formatLogit(-0.001)).toBe("0.00");
  });
});