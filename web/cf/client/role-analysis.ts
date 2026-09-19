/** Contrat de `GET /api/c/{slug}/shap-role` : l'union discriminée `available`
 * écrite par `service/riot_ingest._role_analysis` / `role_scoring.score` dans
 * KV (`shap:{slug}:role`). Le front affiche ce payload tel quel : il n'invente
 * ni ne calcule aucune feature (invariant spec §6.6). */

export interface RoleDriver {
  feature: string;
  /** Nom technique sans suffixe d'agrégation, CHAÎNE côté service
   * (`role_scoring._base_of` : "csm10__mean" → "csm10"). C'est le label
   * affiché sur le graphique ; si le wire l'omet, on replie sur le nom
   * complet, jamais sur une valeur fabriquée. */
  base: string;
  value: number | null;
  contribution: number;
  crossover_value: number | null;
  direction: string | null;
  category: "actionable" | "descriptive";
}

export interface RoleModelMeta {
  model_id: string;
  boundary: string;
  population?: number;
  auc_heldout_median?: number;
  n_seeds?: number;
  corpus?: string;
}

export interface RoleSample {
  profile_examined?: number;
  history_examined?: number;
  role_games_in_profile?: number;
  role_games_used?: number;
  new_games_collected?: number;
  fetch_failures?: number;
  deadline_reached?: boolean;
}

export interface RoleAnalysis {
  schema_version: number;
  generated_at?: string;
  available: true;
  role: string;
  model?: RoleModelMeta;
  sample?: RoleSample;
  intercept?: number;
  logit?: number | null;
  drivers: RoleDriver[];
}

/** Branche indisponible : on ne garde que ce que l'UI rend (le message du
 * motif). `role`/`generated_at` existent sur le wire (spec §4) mais ne
 * s'affichent jamais dans cet état : le parse les ignore volontairement. */
export interface RoleAnalysisUnavailable {
  available: false;
  reason: string;
}

export type RoleAnalysisPayload = RoleAnalysis | RoleAnalysisUnavailable;

/** Libellés français des rôles servis (chaîne exacte côté service :
 * TOP, JUNGLE, MIDDLE, BOTTOM, SUPPORT ; pas MID). */
export const ROLE_LABELS: Record<string, string> = {
  TOP: "Toplane",
  JUNGLE: "Jungle",
  MIDDLE: "Midlane",
  BOTTOM: "Botlane",
  SUPPORT: "Support",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "rôle inconnu";
  return ROLE_LABELS[role] ?? role;
}

/** Un message typé par motif : union discriminée, aucun texte générique qui
 * masquerait la vraie cause (invariant spec §6.3). `fetch_failed` est le seul
 * motif purement client : un échec réseau ne doit pas s'afficher comme une
 * attente de première collecte, ce serait faux. */
export const REASON_MESSAGES: Record<string, string> = {
  not_ingested: "Analyse en attente de la première collecte de parties.",
  role_closed: "L'analyse ML pour ce rôle n'est pas encore ouverte au public.",
  rank_out_of_scope: "Le modèle couvre Diamond et au-delà ; le rang du compte est en dessous.",
  window_too_short: "Moins de 20 parties sur ton rôle principal : la décomposition exige une fenêtre de 20.",
  collection_incomplete: "La collecte n'a pas pu réunir 20 parties du rôle (échecs API ou délai) ; relance l'actualisation.",
  scoring_failed: "Le scoring de cette fenêtre a échoué ; relance l'actualisation.",
  model_missing: "Le modèle de ce rôle est momentanément indisponible côté service.",
  model_mismatch: "Le modèle de ce rôle est momentanément indisponible côté service.",
  fetch_failed: "L'analyse n'a pas pu être chargée ; recharge la page et réessaie.",
};

export function reasonMessage(reason: string): string {
  return REASON_MESSAGES[reason] ?? `Analyse indisponible (motif : ${reason})`;
}

/** Les trois motifs structurels (parmi les neuf) : décidés par les artefacts
 * de modèle déployés (export EBM du rôle) et par `role_readiness.json`, donc
 * identiques pour TOUT compte du site ; aucune re-collecte ne change la
 * réponse. Les six autres motifs sont décidés par les données propres au
 * compte (`rank_out_of_scope` inclus : le service recalcule le tier et le
 * rôle dominant à chaque ingestion, cf. `service/riot_ingest.py`). */
export const GLOBAL_CLOSURE_REASONS: ReadonlySet<string> = Object.freeze(
  new Set(["role_closed", "model_missing", "model_mismatch"]),
);

export function isGlobalClosure(reason: string): boolean {
  return GLOBAL_CLOSURE_REASONS.has(reason);
}

/** Le logit est une proximité à l'apex (log-odds), JAMAIS converti en
 * probabilité ni en rang : MASTER n'appartient à aucune classe
 * d'entraînement et aucune calibration n'existe pour ces modèles
 * (invariant spec §6.1). */
export function formatLogit(logit: number): string {
  const rounded = Math.round(logit * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

const BOUNDARY_LABELS: Record<string, string> = {
  diamond: "Diamond ↔ GM+",
};

export function boundaryLabel(boundary: string): string {
  return BOUNDARY_LABELS[boundary] ?? boundary;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalNumber(value: unknown): number | undefined {
  const parsed = asNumber(value);
  return parsed === null ? undefined : parsed;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function normalizeDriver(value: Record<string, unknown>): RoleDriver {
  return {
    feature: String(value.feature ?? ""),
    // base est une CHAÎNE côté service (`_base_of`). Si le wire l'omet,
    // repli sur le nom complet : on n'écrase jamais un champ réel à 0.
    base: asOptionalString(value.base) ?? String(value.feature ?? ""),
    value: asNumber(value.value),
    contribution: asNumber(value.contribution) ?? 0,
    crossover_value: asNumber(value.crossover_value),
    direction: asOptionalString(value.direction) ?? null,
    // Sens conservateur : toute catégorie inconnue est repliée en
    // « descriptive », la classe qui ne devient jamais un levier.
    category: value.category === "actionable" ? "actionable" : "descriptive",
  };
}

/** Repli client identique à `readRoleShap` côté Worker : clé absente ou
 * payload invalide → `not_ingested`, jamais un crash. */
export function parseRoleAnalysis(value: unknown): RoleAnalysisPayload {
  if (typeof value !== "object" || value === null) {
    return { available: false, reason: "not_ingested" };
  }
  const raw = value as Record<string, unknown>;
  if (raw.available !== true) {
    const reason = asOptionalString(raw.reason);
    return { available: false, reason: reason ?? "not_ingested" };
  }
  const role = asOptionalString(raw.role);
  if (!role) return { available: false, reason: "not_ingested" };
  const drivers = (Array.isArray(raw.drivers) ? raw.drivers : [])
    .filter((driver): driver is Record<string, unknown> =>
      typeof driver === "object" && driver !== null
      && asOptionalString((driver as Record<string, unknown>).feature) !== undefined
      && asNumber((driver as Record<string, unknown>).contribution) !== null)
    .map(normalizeDriver);
  const model = raw.model && typeof raw.model === "object"
    ? {
        model_id: asOptionalString((raw.model as Record<string, unknown>).model_id) ?? "",
        boundary: asOptionalString((raw.model as Record<string, unknown>).boundary) ?? "",
        population: asOptionalNumber((raw.model as Record<string, unknown>).population),
        auc_heldout_median: asOptionalNumber((raw.model as Record<string, unknown>).auc_heldout_median),
        n_seeds: asOptionalNumber((raw.model as Record<string, unknown>).n_seeds),
        corpus: asOptionalString((raw.model as Record<string, unknown>).corpus),
      }
    : undefined;
  const sample = raw.sample && typeof raw.sample === "object"
    ? {
        profile_examined: asOptionalNumber((raw.sample as Record<string, unknown>).profile_examined),
        history_examined: asOptionalNumber((raw.sample as Record<string, unknown>).history_examined),
        role_games_in_profile: asOptionalNumber((raw.sample as Record<string, unknown>).role_games_in_profile),
        role_games_used: asOptionalNumber((raw.sample as Record<string, unknown>).role_games_used),
        new_games_collected: asOptionalNumber((raw.sample as Record<string, unknown>).new_games_collected),
        fetch_failures: asOptionalNumber((raw.sample as Record<string, unknown>).fetch_failures),
        deadline_reached: (raw.sample as Record<string, unknown>).deadline_reached === true,
      }
    : undefined;
  return {
    schema_version: asOptionalNumber(raw.schema_version) ?? 1,
    generated_at: asOptionalString(raw.generated_at),
    available: true,
    role,
    model,
    sample,
    intercept: asOptionalNumber(raw.intercept),
    logit: asNumber(raw.logit),
    drivers,
  };
}