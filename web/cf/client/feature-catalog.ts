import catalogJson from "../../../shared/feature_catalog.json";

export interface FeatureDefinition {
  label: string;
  description: string;
  unit: string;
}

export interface FeaturePresentation extends FeatureDefinition {
  technicalName: string;
  aggregation: string | null;
  aggregationLabel: string | null;
  displayLabel: string;
}

const FEATURE_CATALOG = catalogJson as Record<string, FeatureDefinition>;

const AGGREGATION_LABELS: Record<string, string> = {
  mean: "average",
  std: "variation",
  p10: "10th percentile",
  p50: "median",
  p90: "90th percentile",
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
    technicalName: feature,
    aggregation,
    aggregationLabel,
    displayLabel: aggregationLabel ? `${label} — ${aggregationLabel}` : label,
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

/** Chart.js renders each returned string on its own tooltip line but does not
 * wrap long text. Keep definitions readable on narrow screens. */
export function wrapTooltipText(prefix: string, text: string, maxLength = 68): string[] {
  const lines: string[] = [];
  let current = prefix;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = `${current} ${word}`;
    if (current !== prefix && candidate.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== prefix) lines.push(current);
  return lines.length ? lines : [prefix];
}

export function featureCatalogKeys(): string[] {
  return Object.keys(FEATURE_CATALOG);
}
