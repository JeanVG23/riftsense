import { describe, expect, it } from "vitest";
import { mainRoleFromAnalysis, mainRoleLabel } from "../src/main_role";

describe("main role contract", () => {
  it("consomme le rôle et le scope persistés par l'analyse SHAP", () => {
    expect(mainRoleFromAnalysis({
      schema_version: 1, available: true, role: "BOTTOM", scope: "adc",
    })).toEqual({ role: "BOTTOM", scope: "adc" });
    expect(mainRoleLabel("BOTTOM")).toBe("ADC");
  });

  it("reste compatible avec une ancienne analyse sans scope", () => {
    expect(mainRoleFromAnalysis({
      schema_version: 1, available: false, role: "MIDDLE",
    })).toEqual({ role: "MIDDLE", scope: "mid" });
  });

  it("refuse un rôle absent ou inconnu", () => {
    expect(mainRoleFromAnalysis({
      schema_version: 1, available: false, role: null,
    })).toBeNull();
    expect(mainRoleFromAnalysis({
      schema_version: 1, available: true, role: "UNKNOWN",
    })).toBeNull();
  });
});
