import type { RoleAnalysis } from "./readers";

/** Contrat consommateur du rôle choisi par service/main_role.py.
 *
 * Le Worker ne refait pas le vote : il lit la décision persistée avec le SHAP.
 * Le mapping sert uniquement les anciennes analyses, publiées avant l'ajout du
 * champ `scope`.
 */
const LEGACY_ROLE_SCOPES: Record<string, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

export interface MainRole {
  role: string;
  scope: string;
}

export function mainRoleFromAnalysis(analysis: RoleAnalysis): MainRole | null {
  const role = String(analysis.role ?? "").toUpperCase();
  if (!(role in LEGACY_ROLE_SCOPES)) return null;
  const persistedScope = String(analysis.scope ?? "").toLowerCase();
  const expectedScope = LEGACY_ROLE_SCOPES[role];
  return { role, scope: persistedScope === expectedScope ? persistedScope : expectedScope };
}

export function mainRoleLabel(role: string): string {
  return ({
    TOP: "Top",
    JUNGLE: "Jungle",
    MIDDLE: "Mid",
    BOTTOM: "ADC",
    UTILITY: "Support",
  } as Record<string, string>)[role.toUpperCase()] ?? role;
}
