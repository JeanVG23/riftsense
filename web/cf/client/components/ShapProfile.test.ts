// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestSync } from "../ingest-sync";
import { gaugeOffset } from "../shap-view";
import ShapProfile from "./ShapProfile.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeSync(overrides: Partial<IngestSync> = {}): IngestSync {
  return {
    syncing: false,
    feedback: null,
    cooling: false,
    cooldownLabel: "",
    trigger: vi.fn(),
    ...overrides,
  };
}

/** Payload réaliste : mêmes champs que `role_scoring.score`, 18 métriques
 * distinctes pour couper à 12 lignes. */
function rolePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    generated_at: "2026-09-19T10:00:00Z",
    available: true,
    role: "JUNGLE",
    model: { model_id: "jungle-ebm", boundary: "diamond", auc_heldout_median: 0.83, n_seeds: 10 },
    sample: {
      profile_examined: 20, history_examined: 100, role_games_in_profile: 24,
      role_games_used: 20, new_games_collected: 0, fetch_failures: 0, deadline_reached: false,
    },
    intercept: -1.2,
    logit: 0.62,
    drivers: Array.from({ length: 18 }, (_, index) => ({
      feature: `metric_${index}__mean`,
      base: `metric_${index}`,
      value: index,
      contribution: index % 2 ? -index / 10 : index / 10,
      crossover_value: index === 0 ? 1.5 : null,
      direction: "valeur haute → apex",
      category: index % 3 === 0 ? "descriptive" : "actionable",
    })),
    ...overrides,
  };
}

function driver(feature: string, contribution: number, extra: Record<string, unknown> = {}) {
  return {
    feature,
    base: feature.split("__")[0],
    value: 1,
    contribution,
    crossover_value: null,
    direction: "valeur haute → apex",
    category: "actionable",
    ...extra,
  };
}

function mountShap(props: Partial<{ slug: string; reloadToken: number }> = {}, sync: IngestSync = fakeSync()) {
  return mount(ShapProfile, {
    props: { slug: props.slug ?? "Spadzze", sync, reloadToken: props.reloadToken ?? 0 },
    attachTo: document.body,
  });
}

async function mountLoaded(payload: Record<string, unknown> = rolePayload(), sync?: IngestSync) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
  wrapper = mountShap({}, sync ?? fakeSync());
  await flushPromises();
  await flushPromises();
  return wrapper;
}

/** Le tableau complet est replié au chargement : tout ce qui l'inspecte passe
 * par ce dépli, comme un visiteur qui demande le détail. */
async function openDetail(view: VueWrapper): Promise<VueWrapper> {
  await view.get(".shap-detail-toggle").trigger("click");
  return view;
}

async function mountDetail(payload: Record<string, unknown> = rolePayload()) {
  return openDetail(await mountLoaded(payload));
}

describe("ShapProfile · le score situé", () => {
  it("place le score sur l'axe du modèle au lieu de l'afficher nu", async () => {
    const view = await mountLoaded();

    expect(view.text()).toContain("What shapes your ML profile");
    expect(view.text()).toContain("latest 20 Jungle games");
    expect(view.text()).toContain("Apex proximity");
    expect(view.text()).toContain("+0.62");
    expect(view.text()).toContain("Diamond ↔ GM+ boundary");
    expect(view.text()).toContain("median AUC 0.83 across 10 runs");
    expect(view.get(".shap-gauge-cursor").attributes("style"))
      .toContain(`left: ${gaugeOffset(0.62).toFixed(2)}%`);
  });

  it("annonce que l'axe est une position relative, pas un rang prédit", async () => {
    const view = await mountLoaded();
    await view.get(".shap-help-toggle").trigger("click");

    expect(view.get(".shap-gauge-note").text().replace(/\s+/g, " ")).toBe(
      "Log-odds scale, shown from -3 to +3; zero is the boundary the model learned. "
      + "A relative position, not a predicted rank or a probability.");
  });

  it("ne convertit le score ni en probabilité ni en rang", async () => {
    const view = await mountLoaded();
    const score = view.get(".shap-score-block").text();

    expect(score).toContain("+0.62");
    expect(score).not.toContain("%");
    expect(score).not.toContain("Challenger");
  });
});

describe("ShapProfile · la lecture au premier coup d'oeil", () => {
  it("ouvre sur une phrase qui nomme le domaine le plus lourd de chaque sens", async () => {
    const view = await mountLoaded(rolePayload({
      drivers: [
        driver("csm10__mean", -0.4),
        driver("pos_avg_map_depth__mean", -0.7, { category: "descriptive" }),
        driver("pos_wards_killed__mean", 0.3),
      ],
    }));

    expect(view.get(".shap-verdict").text().replace(/\s+/g, " ")).toBe(
      "Positioning & map weighs most against your score; "
      + "Vision is where the model credits you most.");
  });

  it("garde le tableau complet replié au chargement", async () => {
    const view = await mountLoaded();

    expect(view.findAll(".shap-metric-row")).toHaveLength(0);
    expect(view.find(".shap-legend-strip").exists()).toBe(false);
    expect(view.get(".shap-detail-toggle").text()).toContain("Every published metric (18)");
    expect(view.get(".shap-detail-toggle").attributes("aria-expanded")).toBe("false");
  });

  it("ouvre la totalité des métriques d'un seul dépli", async () => {
    const view = await mountDetail();

    expect(view.findAll(".shap-metric-row")).toHaveLength(18);
    expect(view.get(".shap-detail-toggle").attributes("aria-expanded")).toBe("true");
  });

  // Une phrase par ligne rendait le tableau illisible : on lisait tout ou on
  // sautait tout. Le chiffre et la barre se scannent, la phrase se demande.
  it("réserve la phrase de lecture au dépli de sa ligne", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [driver("deaths_late__p90", -0.3, {
        value: 4, crossover_value: 2.5, direction: "valeur haute → sous-apex",
      })],
    }));
    expect(view.find(".metric-read").exists()).toBe(false);

    await view.get(".metric-head").trigger("click");

    expect(view.get(".metric-read").text()).toContain("tipping point 2.5 deaths");
  });

  it("range les explications derrière un bouton au lieu de les laisser à l'écran", async () => {
    const view = await mountLoaded();
    expect(view.find(".shap-help-panel").exists()).toBe(false);
    expect(view.find(".shap-gauge-note").exists()).toBe(false);

    await view.get(".shap-help-toggle").trigger("click");

    const help = view.get(".shap-help-panel").text().replace(/\s+/g, " ");
    expect(help).toContain("moves you closer to the apex");
    expect(help).toContain("never presented as something to fix");
    expect(help).toContain("the breakdown of your score, not a to-do list");
  });
});

describe("ShapProfile · d'où vient l'écart", () => {
  it("résume les contributions par thème, dans l'ordre de la page", async () => {
    const view = await mountLoaded(rolePayload({
      drivers: [
        driver("csm10__mean", -0.5),
        driver("gpm10__mean", -0.1),
        driver("pos_wards_killed__p90", 0.2),
      ],
    }));
    const rows = view.findAll(".shap-theme-row");

    expect(rows.map((row) => row.get(".theme-label").text()))
      .toEqual(["Farm & economy", "Vision"]);
    expect(rows[0].get(".theme-net").text()).toBe("-0.60");
    expect(rows[1].get(".theme-net").text()).toBe("+0.20");
  });
});

describe("ShapProfile · forces et leviers", () => {
  it("formule trois forces et trois leviers en phrases", async () => {
    const view = await mountLoaded(rolePayload({
      drivers: [
        driver("deaths_late__std", -0.5, { value: 1.85, crossover_value: 1.29, direction: "valeur haute → sous-apex" }),
        driver("gpm10__p10", -0.2),
        driver("csm10__mean", -0.1),
        driver("pos_wards_killed__p90", 0.4),
        driver("kills_2v2__mean", 0.3),
        driver("kda_2v2__mean", 0.2),
        driver("pos_frac_base__mean", 0.15),
      ],
    }));

    expect(view.findAll(".shap-highlight--lever")).toHaveLength(3);
    expect(view.findAll(".shap-highlight--strength")).toHaveLength(3);
    const lever = view.findAll(".shap-highlight--lever")[0].text();
    expect(lever).toContain("Late-game deaths");
    expect(lever).toContain("1.85 deaths");
    expect(lever).toContain("tipping point 1.29 deaths");
    expect(lever).toContain("Lower moves you toward the apex");
  });

  it("ne formule jamais une métrique descriptive en levier", async () => {
    const view = await mountLoaded(rolePayload({
      drivers: [
        driver("frac_behind__p50", -0.9, { category: "descriptive" }),
        driver("csm10__mean", -0.2),
      ],
    }));
    const levers = view.findAll(".shap-highlight--lever").map((node) => node.text());

    expect(levers).toHaveLength(1);
    expect(levers[0]).toContain("CS per minute at 10 minutes");
    expect(levers.join(" ")).not.toContain("Time spent behind in lane");
  });
});

describe("ShapProfile · le détail par métrique", () => {
  it("regroupe les agrégations d'une même métrique en une ligne nette", async () => {
    // Le cas qui rendait la page illisible : la même métrique publiée en
    // cinq agrégations qui se compensent, affichée cinq fois avec des
    // couleurs opposées.
    const view = await mountDetail(rolePayload({
      drivers: [
        driver("pos_frac_enemy_half__mean", -0.14),
        driver("pos_frac_enemy_half__p90", 0.13),
        driver("pos_frac_enemy_half__std", 0.09),
        driver("pos_frac_enemy_half__p50", -0.08),
      ],
    }));
    const rows = view.findAll(".shap-metric-row");

    expect(rows).toHaveLength(1);
    expect(rows[0].get(".metric-label").text()).toBe("Time spent in enemy territory");
    expect(rows[0].get(".metric-net").text()).toBe("+0.00");
  });

  it("sort le point de bascule et le sens de l'info-bulle", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [driver("deaths_late__p90", -0.3, {
        value: 4, crossover_value: 2.5, direction: "valeur haute → sous-apex",
      })],
    }));
    await view.get(".metric-head").trigger("click");
    const row = view.get(".shap-metric-row").text();

    expect(row).toContain("At your highest");
    expect(row).toContain("4 deaths");
    expect(row).toContain("tipping point 2.5 deaths");
    expect(row).toContain("Lower moves you toward the apex");
  });

  it("déplie les agrégations avec leur valeur et leur nom technique", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [
        driver("csm10__mean", 0.3, { value: 7.3 }),
        driver("csm10__p10", -0.1, { value: 5.9 }),
      ],
    }));
    expect(view.find(".metric-parts").exists()).toBe(false);

    await view.get(".metric-head").trigger("click");

    const parts = view.get(".metric-parts").text();
    expect(parts).toContain("on average");
    expect(parts).toContain("7.3 CS/min");
    expect(parts).toContain("at your lowest");
    expect(parts).toContain("csm10__p10");
    expect(parts).toContain("Your farming pace during the first 10 minutes");
  });

  it("titre les colonnes du détail au lieu de répéter l'étiquette sur chaque ligne", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [
        driver("csm10__mean", 0.3, { value: 7.3, crossover_value: 7.1 }),
        driver("csm10__p10", -0.1, { value: 5.9, crossover_value: 6.4 }),
      ],
    }));
    await view.get(".metric-head").trigger("click");

    const header = view.get(".metric-parts-header").text();
    expect(header).toContain("your value");
    expect(header).toContain("tipping point");
    expect(view.get(".metric-part").text()).not.toContain("tipping point");
    expect(view.get(".metric-part").text()).toContain("7.1 CS/min");
  });

  it("marque le contexte sans jamais l'habiller en levier", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [driver("frac_behind__mean", -0.2, { category: "descriptive" })],
    }));

    expect(view.get(".shap-metric-row").text()).toContain("context");
    expect(view.findAll(".shap-highlight--lever")).toHaveLength(0);
  });

  it("filtre les leviers d'action", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [
        driver("csm10__mean", 0.5),
        driver("frac_behind__mean", -0.4, { category: "descriptive" }),
        driver("gpm10__mean", 0.3),
      ],
    }));
    expect(view.findAll(".shap-metric-row")).toHaveLength(3);

    const filterButton = view.findAll("button").find((button) => button.text().includes("All"));
    await filterButton!.trigger("click");

    expect(view.findAll(".shap-metric-row").map((row) => row.get(".metric-label").text()))
      .toEqual(["CS per minute at 10 minutes", "Gold per minute at 10 minutes"]);
    expect(filterButton!.text()).toContain("Actionable factors only");
  });

  it("bascule du tri par impact au tri par valeur signée", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [driver("csm10__mean", -0.5), driver("gpm10__mean", 0.3)],
    }));
    expect(view.findAll(".metric-label").map((node) => node.text()))
      .toEqual(["CS per minute at 10 minutes", "Gold per minute at 10 minutes"]);

    const sortButton = view.findAll("button").find((button) => button.text().includes("Sort by impact"));
    await sortButton!.trigger("click");

    expect(view.findAll(".metric-label").map((node) => node.text()))
      .toEqual(["Gold per minute at 10 minutes", "CS per minute at 10 minutes"]);
  });

  it("recharge l'analyse quand reloadToken change (fin de collecte)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(rolePayload()));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await wrapper!.setProps({ reloadToken: 1 });
    await flushPromises();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ShapProfile · liste de facteurs vide", () => {
  it("available: true avec drivers vides : message dédié, aucune ligne", async () => {
    const view = await mountDetail(rolePayload({ drivers: [] }));

    expect(view.text()).toContain("No factors were published for this game window.");
    expect(view.findAll(".shap-metric-row")).toHaveLength(0);
  });

  it("filtre `actionable` sans aucun levier : message dédié invitant à revenir sur « Tout »", async () => {
    const view = await mountDetail(rolePayload({
      drivers: [driver("frac_behind__mean", -0.2, { category: "descriptive" })],
    }));
    expect(view.findAll(".shap-metric-row")).toHaveLength(1);

    const filterButton = view.findAll("button").find((button) => button.text().includes("All"));
    await filterButton!.trigger("click");

    expect(view.text()).toContain(
      "No actionable factors among the published data. Switch back to “All” to view context factors.");
    expect(view.findAll(".shap-metric-row")).toHaveLength(0);

    await filterButton!.trigger("click");
    expect(view.findAll(".shap-metric-row")).toHaveLength(1);
  });
});

describe("ShapProfile · états d'indisponibilité", () => {
  it("affiche le message typé de chaque motif servi", async () => {
    const cases: Array<[string, string]> = [
      ["not_ingested", "Analysis is waiting for the first game collection."],
      ["role_closed", "ML analysis for this role is not publicly available yet."],
      ["rank_out_of_scope", "The model covers Diamond and above; this account is below that range."],
      ["window_too_short", "Fewer than 20 games on your main role: the breakdown requires a 20-game window."],
      ["collection_incomplete", "We couldn't collect 20 games for this role (API errors or timeout). Refresh the data and try again."],
      ["scoring_failed", "Scoring failed for this window. Refresh the data and try again."],
      ["model_missing", "The model for this role is temporarily unavailable."],
      ["model_mismatch", "The model for this role is temporarily unavailable."],
    ];
    for (const [reason, message] of cases) {
      wrapper?.unmount();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason, role: null })));
      wrapper = mountShap({ slug: "Two" });
      await flushPromises();

      expect(wrapper.text()).toContain(message);
    }
  });

  it("échec réseau : motif client fetch_failed, pas une fausse attente de collecte", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    expect(wrapper.text()).toContain("The analysis could not be loaded. Refresh the page and try again.");
    expect(wrapper.text()).not.toContain("waiting for the first game collection");
  });

  it("montre le code d'un motif inconnu au lieu de le masquer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason: "maintenance_v2" })));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    expect(wrapper.text()).toContain("maintenance_v2");
  });

  it("conserve les liens démo vers les comptes calibrés pour un motif personnel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason: "window_too_short", role: null })));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    expect(wrapper.find("a[href='/c/spadzze?tab=shap']").exists()).toBe(true);
    expect(wrapper.find("a[href='/c/aceofspadzze?tab=shap']").exists()).toBe(true);
  });

  it("retire le bouton d'actualisation ET les liens démo pour les 3 motifs structurels", async () => {
    for (const reason of ["role_closed", "model_missing", "model_mismatch"]) {
      wrapper?.unmount();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason, role: null })));
      wrapper = mountShap({ slug: "Two" });
      await flushPromises();

      expect(wrapper.find("button.btn-refresh-shap").exists()).toBe(false);
      expect(wrapper.find(".shap-demo-guidance").exists()).toBe(false);
    }
  });
});

describe("ShapProfile · bouton Actualiser l'analyse", () => {
  it("rend l'état du composable : grisage et décompte pendant le cooldown", async () => {
    const view = await mountLoaded(rolePayload(), fakeSync({ cooling: true, cooldownLabel: "Up to date · 14 min" }));

    const button = view.get("button.btn-refresh-shap");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.text()).toContain("Up to date · 14 min");
  });

  it("déclenche sync.trigger au clic, sans logique locale", async () => {
    const trigger = vi.fn();
    const view = await mountLoaded(rolePayload(), fakeSync({ trigger }));

    await view.get("button.btn-refresh-shap").trigger("click");
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("rend AUSSI le bouton dans l'état indisponible pour un motif personnel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason: "collection_incomplete" })));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    expect(wrapper.find("button.btn-refresh-shap").exists()).toBe(true);
  });
});
