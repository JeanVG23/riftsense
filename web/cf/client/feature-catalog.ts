import catalogJson from "../../../shared/feature_catalog.json";

/** Sections of the ML profile page. Mirrored by `THEMES` in
 * `tests/test_feature_catalog.py`, which holds the closed vocabulary: the
 * JSON import types `theme` as a plain string, so the data side is what
 * proves no feature lands in a section that does not exist. */
export type FeatureTheme =
  | "economy" | "positioning" | "vision" | "fights" | "objectives" | "context";

export const THEME_ORDER: readonly FeatureTheme[] = [
  "economy", "positioning", "vision", "fights", "objectives", "context",
];

const THEME_LABELS: Record<FeatureTheme, string> = {
  economy: "Farm & economy",
  positioning: "Positioning & map",
  vision: "Vision",
  fights: "Fights & survival",
  objectives: "Objectives",
  context: "Game context",
};

export function themeLabel(theme: FeatureTheme): string {
  return THEME_LABELS[theme];
}

export interface FeatureDefinition {
  label: string;
  description: string;
  unit: string;
  theme: FeatureTheme;
}

export interface FeaturePresentation extends FeatureDefinition {
  technicalName: string;
  aggregation: string | null;
  aggregationLabel: string | null;
  displayLabel: string;
}

const FEATURE_CATALOG = catalogJson as unknown as Record<string, FeatureDefinition>;

/** What the aggregation MEANS, not what it is called. A percentile is worded
 * as an end of the observed range and never as a good or a bad game: p10 is
 * the best games for deaths and the worst ones for farming, so any wording
 * that judged the game would be false for half the catalog. */
const AGGREGATION_LABELS: Record<string, string> = {
  mean: "on average",
  std: "swing between games",
  p10: "at your lowest",
  p50: "in a typical game",
  p90: "at your highest",
};

function humanizeIdentifier(value: string): string {
  const words = value.replace(/^pos_/, "").replaceAll("_", " ").trim();
  if (!words) return "Unknown feature";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Presentation metadata is deliberately separate from the immutable model
 * identifiers. Unknown future features degrade to a readable label while the
 * technical name remains visible in the tooltip. */
export function featurePresentation(feature: string, base?: string): FeaturePresentation {
  const [featureBase, aggregation = null] = feature.split("__", 2);
  // Older payloads may omit `base`; the parser then conservatively copies the
  // complete feature name. Recover the real base here so catalog lookup still
  // works for `csm10__mean` instead of falling back to a technical label.
  const catalogKey = base && !base.includes("__") ? base : featureBase;
  const definition = FEATURE_CATALOG[catalogKey];
  const label = definition?.label ?? humanizeIdentifier(catalogKey);
  const aggregationLabel = aggregation
    ? (AGGREGATION_LABELS[aggregation] ?? humanizeIdentifier(aggregation).toLowerCase())
    : null;

  return {
    label,
    description: definition?.description ?? "No plain-English definition is available yet.",
    unit: definition?.unit ?? "value",
    // A feature published before the catalog knows it is still real data, so
    // it is shown; "context" is the section that is never worded as a lever.
    theme: definition?.theme ?? "context",
    technicalName: feature,
    aggregation,
    aggregationLabel,
    displayLabel: aggregationLabel ? `${label}, ${aggregationLabel}` : label,
  };
}

export function formatFeatureValue(value: number, unit: string): string {
  const displayed = unit === "%" ? value * 100 : value;
  const decimals = Math.abs(displayed) >= 100 ? 0 : Math.abs(displayed) >= 10 ? 1 : 2;
  const formatted = displayed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

export function featureCatalogKeys(): string[] {
  return Object.keys(FEATURE_CATALOG);
}
