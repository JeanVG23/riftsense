/** Mise en forme de la décomposition EBM pour l'onglet ML.
 *
 * Le service publie une ligne par (métrique × agrégation) : 191 lignes pour
 * 39 métriques sur la fenêtre de Spadzze, dont la même métrique tire dans les
 * deux sens selon l'agrégation. Ce module regroupe, traduit et ordonne ; il ne
 * calcule aucune feature (invariant spec §6.6). Les sommes qu'il fait sont des
 * sommes de contributions PUBLIÉES, exactes par construction : un EBM à effets
 * principaux est additif, `intercept + Σ contributions = logit`.
 */
import {
  THEME_ORDER,
  featurePresentation,
  themeLabel,
  type FeatureTheme,
} from "./feature-catalog";
import type { RoleDriver } from "./role-analysis";

/** Sens de la shape function, en enum stable. Le wire publie une phrase
 * française (`role_scoring` reprend le résumé d'entraînement) alors que la
 * page est en anglais : la traduction vit ici, comme `REASON_MESSAGES`. */
export type DirectionSense = "higher-closer" | "higher-farther" | "unknown";

const DIRECTION_SENSES: Record<string, DirectionSense> = {
  "valeur haute → apex": "higher-closer",
  "valeur haute → sous-apex": "higher-farther",
};

export function directionSense(direction: string | null | undefined): DirectionSense {
  return (direction && DIRECTION_SENSES[direction]) || "unknown";
}

const DIRECTION_HINTS: Record<DirectionSense, string> = {
  "higher-closer": "Higher moves you toward the apex",
  "higher-farther": "Lower moves you toward the apex",
  unknown: "No consistent direction in this window",
};

export function directionHint(sense: DirectionSense): string {
  return DIRECTION_HINTS[sense];
}

export interface DriverPart {
  feature: string;
  aggregationLabel: string | null;
  value: number | null;
  crossover: number | null;
  unit: string;
  contribution: number;
  sense: DirectionSense;
}

export interface BaseGroup {
  base: string;
  label: string;
  description: string;
  unit: string;
  theme: FeatureTheme;
  /** Somme des contributions publiées de la métrique, toutes agrégations. */
  net: number;
  actionable: boolean;
  parts: DriverPart[];
  /** L'agrégation qui EXPLIQUE le net : la plus lourde parmi celles qui en
   * portent le signe. La plus lourde tout court le contredit sur 4 des 39
   * métriques de la fenêtre de Spadzze, et la ligne de lecture dirait alors
   * l'inverse du chiffre affiché juste à côté. */
  lead: DriverPart | null;
}

export interface ThemeGroup {
  theme: FeatureTheme;
  label: string;
  net: number;
}

const byAbsoluteWeight = (left: { contribution: number }, right: { contribution: number }) =>
  Math.abs(right.contribution) - Math.abs(left.contribution);

export function groupByBase(drivers: RoleDriver[]): BaseGroup[] {
  const groups = new Map<string, BaseGroup>();
  for (const driver of drivers) {
    const presentation = featurePresentation(driver.feature, driver.base);
    const group = groups.get(driver.base) ?? {
      base: driver.base,
      label: presentation.label,
      description: presentation.description,
      unit: presentation.unit,
      theme: presentation.theme,
      net: 0,
      // Repli conservateur sur une catégorie mixte : « contexte » est la
      // classe qui ne se formule jamais en levier, donc la seule sûre.
      actionable: true,
      parts: [],
      lead: null,
    };
    group.net += driver.contribution;
    group.actionable &&= driver.category === "actionable";
    group.parts.push({
      feature: driver.feature,
      aggregationLabel: presentation.aggregationLabel,
      value: driver.value,
      crossover: driver.crossover_value,
      unit: presentation.unit,
      contribution: driver.contribution,
      sense: directionSense(driver.direction),
    });
    groups.set(driver.base, group);
  }
  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.parts.sort(byAbsoluteWeight);
    const signed = group.net >= 0
      ? group.parts.filter((part) => part.contribution > 0)
      : group.parts.filter((part) => part.contribution < 0);
    group.lead = signed[0] ?? group.parts[0] ?? null;
  }
  return ordered.sort((left, right) => Math.abs(right.net) - Math.abs(left.net));
}

export function groupByTheme(drivers: RoleDriver[]): ThemeGroup[] {
  const totals = new Map<FeatureTheme, number>();
  for (const driver of drivers) {
    const { theme } = featurePresentation(driver.feature, driver.base);
    totals.set(theme, (totals.get(theme) ?? 0) + driver.contribution);
  }
  return THEME_ORDER
    .filter((theme) => totals.has(theme))
    .map((theme) => ({ theme, label: themeLabel(theme), net: totals.get(theme) as number }));
}

/** La seule phrase du premier coup d'oeil : quel domaine pèse le plus, dans
 * chaque sens. Elle LIT la décomposition publiée et ne prescrit rien, parce
 * qu'un thème agrège aussi des métriques `descriptive` : « weighs against your
 * score » est donc le plus loin qu'on puisse aller sans transformer du
 * contexte en consigne. Sans poids d'un côté, la proposition disparaît plutôt
 * que d'être servie à vide. */
export function verdictLine(themes: ThemeGroup[]): string | null {
  const heaviest = (side: 1 | -1) =>
    themes
      .filter((theme) => Math.sign(theme.net) === side)
      .sort((left, right) => Math.abs(right.net) - Math.abs(left.net))[0] ?? null;
  const worst = heaviest(-1);
  const best = heaviest(1);
  const clauses = [
    worst && `${worst.label} weighs most against your score`,
    best && `${best.label} is where the model credits you most`,
  ].filter(Boolean);
  return clauses.length ? `${clauses.join("; ")}.` : null;
}

const HIGHLIGHT_COUNT = 3;

/** Forces et leviers, lus sur les métriques actionnables UNIQUEMENT. Une
 * métrique descriptive peut peser lourd (`frac_behind` vaut -0.09 chez
 * Spadzze) sans jamais devenir une consigne : c'est l'asymétrie de
 * l'information appliquée à l'affichage. */
export function pickHighlights(groups: BaseGroup[]): { strengths: BaseGroup[]; levers: BaseGroup[] } {
  const actionable = groups.filter((group) => group.actionable);
  return {
    strengths: actionable.filter((group) => group.net > 0).slice(0, HIGHLIGHT_COUNT),
    levers: actionable.filter((group) => group.net < 0).slice(0, HIGHLIGHT_COUNT),
  };
}

/** Demi-étendue de l'axe affiché, en log-odds. Une échelle d'affichage, pas
 * une borne du modèle : au-delà, le curseur est plaqué sur l'extrémité. */
export const GAUGE_MAX_LOGIT = 3;

export function gaugeOffset(logit: number): number {
  const ratio = Math.max(-1, Math.min(1, logit / GAUGE_MAX_LOGIT));
  return 50 + ratio * 50;
}

/** Contribution signée à deux décimales. Le signe est porté explicitement :
 * c'est toute la lecture d'une contribution. Le zéro est normalisé avant
 * l'affichage, sinon une somme d'agrégations qui se compensent (-1.4e-17 pour
 * `pos_frac_enemy_half` chez Spadzze) s'afficherait « -0.00 ». */
export function formatContribution(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const safe = rounded === 0 ? 0 : rounded;
  return safe >= 0 ? `+${safe.toFixed(2)}` : safe.toFixed(2);
}
