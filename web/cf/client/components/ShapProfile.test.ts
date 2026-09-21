// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestSync } from "../ingest-sync";
import ShapProfile from "./ShapProfile.ce.vue";

const chartMock = vi.hoisted(() => ({
  configs: [] as Array<Record<string, any>>,
  destroy: vi.fn(),
  register: vi.fn(),
}));

vi.mock("chart.js", () => ({
  registerables: [],
  Chart: class Chart {
    static register = chartMock.register;
    destroy = chartMock.destroy;
    constructor(_canvas: HTMLCanvasElement, config: Record<string, any>) {
      chartMock.configs.push(config);
    }
  },
}));

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  chartMock.configs.length = 0;
  chartMock.destroy.mockClear();
  chartMock.register.mockClear();
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

/** Payload réaliste : mêmes champs que `role_scoring.score`, 18 drivers
 * mélangés actionable/descriptive pour couper à 16. */
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
      feature: `feature_${index}__mean`,
      base: `feature_${index}`,
      value: index,
      contribution: index % 2 ? -index : index,
      crossover_value: index === 0 ? 1.5 : null,
      direction: "valeur haute → apex",
      category: index % 3 === 0 ? "descriptive" : "actionable",
    })),
    ...overrides,
  };
}

function mountShap(props: Partial<{ slug: string; reloadToken: number }> = {}, sync: IngestSync = fakeSync()) {
  return mount(ShapProfile, {
    props: { slug: props.slug ?? "Spadzze", sync, reloadToken: props.reloadToken ?? 0 },
    attachTo: document.body,
  });
}

describe("ShapProfile · état disponible", () => {
  it("charge l'analyse de rôle, le contexte et le score, et coupe à 16 facteurs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(rolePayload()));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/c/Spadzze/shap-role");
    expect(wrapper.text()).toContain("What shapes your ML profile");
    expect(wrapper.text()).toContain("latest 20 Jungle games");
    expect(wrapper.text()).toContain("generated");
    expect(wrapper.text()).toContain("Apex proximity");
    expect(wrapper.text()).toContain("+0.62");
    expect(wrapper.text()).toContain("Diamond ↔ GM+ boundary");
    expect(wrapper.text()).toContain("median AUC 0.83 across 10 runs");
    expect(chartMock.configs).toHaveLength(1);
    expect((chartMock.configs[0].data as { labels: string[] }).labels).toHaveLength(16);
  });

  it("affiche le logit tel quel : aucune probabilité, aucun rang converti", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload())));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("+0.62");
    expect(wrapper.text()).not.toContain("%");
    expect(wrapper.text()).not.toContain("Challenger");
  });

  it("enrichit le tooltip avec valeur formatée, définition et nom technique", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "csm10__mean", base: "csm10", value: 7.3, contribution: 0.21, crossover_value: 7.14, direction: "valeur haute → apex", category: "actionable" },
        { feature: "map_depth__mean", base: "map_depth", value: 14, contribution: -0.05, crossover_value: null, direction: null, category: "descriptive" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    const label = chartMock.configs[0].options.plugins.tooltip.callbacks.label;
    expect(label({ dataIndex: 0, raw: 0.21 })).toEqual([
      "Contribution 0.2100",
      "Value 7.3 CS/min",
      "Actionable factor",
      "Crossover ≈ 7.14 CS/min",
    ]);
    const descriptive = label({ dataIndex: 1, raw: -0.05 });
    expect(descriptive).toContain("Context only");
    expect(descriptive.some((line: string) => line.startsWith("Crossover"))).toBe(false);

    const afterLabel = chartMock.configs[0].options.plugins.tooltip.callbacks.afterLabel;
    const details = afterLabel({ dataIndex: 0 });
    expect(details.at(-1)).toBe("Technical feature: csm10__mean");
    expect(details.slice(0, -1).join(" ")).toBe(
      "Definition: Your farming pace during the first 10 minutes, including lane minions and jungle monsters.");
    expect(chartMock.configs[0].options.interaction).toEqual({
      mode: "index", axis: "y", intersect: false,
    });
  });

  it("affiche le libellé anglais et rend toujours l'agrégation explicite", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "csm10__mean", base: "csm10", value: 7.3, contribution: 0.3, crossover_value: null, direction: null, category: "actionable" },
        { feature: "csm10__max", base: "csm10", value: 9.1, contribution: 0.2, crossover_value: null, direction: null, category: "actionable" },
        { feature: "ward_score__mean", base: "ward_score", value: 1, contribution: 0.1, crossover_value: null, direction: null, category: "descriptive" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect((chartMock.configs[0].data as { labels: string[] }).labels)
      .toEqual([
        "CS per minute at 10 minutes — average",
        "CS per minute at 10 minutes — max",
        "Ward score — average (context)",
      ]);
  });

  it("marque les drivers non actionable de « (context) » dans le libellé, jamais les leviers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "csm10__mean", base: "csm10", value: 7.3, contribution: 0.3, crossover_value: null, direction: null, category: "actionable" },
        { feature: "map_depth__mean", base: "map_depth", value: 14, contribution: -0.1, crossover_value: null, direction: null, category: "descriptive" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect((chartMock.configs[0].data as { labels: string[] }).labels)
      .toEqual([
        "CS per minute at 10 minutes — average",
        "Map depth — average (context)",
      ]);
  });

  it("filtre les leviers d'action et recrée le graphique", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "levier_a__mean", base: "levier_a", value: 1, contribution: 0.5, crossover_value: null, direction: null, category: "actionable" },
        { feature: "contexte_b__mean", base: "contexte_b", value: 2, contribution: -0.4, crossover_value: null, direction: null, category: "descriptive" },
        { feature: "levier_c__mean", base: "levier_c", value: 3, contribution: 0.3, crossover_value: null, direction: null, category: "actionable" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();
    expect((chartMock.configs[0].data as { labels: string[] }).labels)
      .toEqual([
        "Levier a — average",
        "Contexte b — average (context)",
        "Levier c — average",
      ]);

    const filterButton = wrapper.findAll("button").find((button) => button.text().includes("All"));
    await filterButton!.trigger("click");
    await flushPromises();
    await flushPromises();

    expect((chartMock.configs.at(-1)?.data as { labels: string[] }).labels)
      .toEqual(["Levier a — average", "Levier c — average"]);
    expect(filterButton!.text()).toContain("Actionable factors only");
  });

  it("recrée proprement le graphique lors du changement de tri", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "negative__mean", base: "negative", value: 1, contribution: -5, crossover_value: null, direction: null, category: "actionable" },
        { feature: "positive__mean", base: "positive", value: 2, contribution: 3, crossover_value: null, direction: null, category: "actionable" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    const sortButton = wrapper.findAll("button").find((button) => button.text().includes("Sort by impact"));
    await sortButton!.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(chartMock.destroy).toHaveBeenCalled();
    expect((chartMock.configs.at(-1)?.data as { labels: string[] }).labels)
      .toEqual(["Positive — average", "Negative — average"]);
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
  it("available: true avec drivers vides : message dédié, aucun canvas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({ drivers: [] }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("No factors were published for this game window.");
    expect(wrapper.find("canvas").exists()).toBe(false);
    expect(chartMock.configs).toHaveLength(0);
  });

  it("filtre `actionable` sans aucun levier : message dédié invitant à revenir sur « Tout », puis le graphique se restaure au retour", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload({
      drivers: [
        { feature: "context_only__mean", base: "context_only", value: 1, contribution: -0.2, crossover_value: null, direction: null, category: "descriptive" },
      ],
    }))));
    wrapper = mountShap();
    await flushPromises();
    await flushPromises();

    expect(wrapper.find("canvas").exists()).toBe(true);
    expect(chartMock.configs).toHaveLength(1);

    const filterButton = wrapper.findAll("button").find((button) => button.text().includes("All"));
    await filterButton!.trigger("click");
    await flushPromises();
    await flushPromises();

    // Filtré sur les leviers uniquement, mais le seul driver de la fenêtre
    // est descriptif : liste vide, message distinct de « aucun facteur
    // publié », avec le rappel qu'il suffit de revenir sur « Tout ».
    expect(wrapper.text()).toContain(
      "No actionable factors among the published data. Switch back to “All” to view context factors.");
    expect(wrapper.find("canvas").exists()).toBe(false);

    await filterButton!.trigger("click");
    await flushPromises();
    await flushPromises();

    // Retour sur « Tout » : le canvas est recréé (nouvel élément, derrière le
    // v-if) et le graphique est rendu contre CE nouvel élément, pas un noeud
    // détaché de l'ancien rendu.
    expect(wrapper.find("canvas").exists()).toBe(true);
    expect((chartMock.configs.at(-1)?.data as { labels: string[] }).labels)
      .toEqual(["Context only — average (context)"]);
  });
});

describe("ShapProfile · états d'indisponibilité", () => {
  it("affiche le message typé de chaque motif servi, sans télécharger Chart.js", async () => {
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
      chartMock.configs.length = 0;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason, role: null })));
      wrapper = mountShap({ slug: "Two" });
      await flushPromises();

      expect(wrapper.text()).toContain(message);
      expect(chartMock.configs).toHaveLength(0);
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
    // window_too_short est décidé par les données du compte (pas un motif
    // structurel) : les comptes démo affichent réellement une analyse, le CTA
    // reste donc honnête.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason: "window_too_short", role: null })));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    expect(wrapper.find("a[href='/c/spadzze?tab=shap']").exists()).toBe(true);
    expect(wrapper.find("a[href='/c/aceofspadzze?tab=shap']").exists()).toBe(true);
  });

  it("retire le bouton d'actualisation ET les liens démo pour les 3 motifs structurels (role_closed, model_missing, model_mismatch)", async () => {
    // Ces motifs sont décidés par les artefacts déployés : identiques pour
    // tout compte, aucune re-collecte ne les change. Le bouton promettrait un
    // recalcul impossible et consommerait pour rien le cooldown partagé avec
    // le hero ; les comptes démo rendraient la même carte indisponible, donc
    // le lien promettrait un palier et une décomposition inexistants.
    for (const reason of ["role_closed", "model_missing", "model_mismatch"]) {
      wrapper?.unmount();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason, role: null })));
      wrapper = mountShap({ slug: "Two" });
      await flushPromises();

      expect(wrapper.find("button.btn-refresh-shap").exists()).toBe(false);
      expect(wrapper.find(".shap-demo-guidance").exists()).toBe(false);
      expect(wrapper.find("a[href='/c/spadzze?tab=shap']").exists()).toBe(false);
      expect(wrapper.find("a[href='/c/aceofspadzze?tab=shap']").exists()).toBe(false);
    }
  });
});

describe("ShapProfile · bouton Actualiser l'analyse", () => {
  it("rend l'état du composable : grisage et décompte pendant le cooldown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload())));
    wrapper = mountShap({}, fakeSync({ cooling: true, cooldownLabel: "Up to date · 14 min" }));
    await flushPromises();
    await flushPromises();

    const button = wrapper.get("button.btn-refresh-shap");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.text()).toContain("Up to date · 14 min");
  });

  it("déclenche sync.trigger au clic, sans logique locale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rolePayload())));
    const trigger = vi.fn();
    wrapper = mountShap({}, fakeSync({ trigger }));
    await flushPromises();
    await flushPromises();

    await wrapper.get("button.btn-refresh-shap").trigger("click");
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("rend AUSSI le bouton et les liens démo dans l'état indisponible pour un motif personnel : collection_incomplete et scoring_failed disent « relance l'actualisation »", async () => {
    // Bug pointé en revue : le bouton ne vivait que dans la branche
    // disponible, alors que deux messages d'indisponibilité invitent
    // explicitement à relancer. Le CTA doit exister là où on l'appelle.
    // collection_incomplete est un motif PERSONNEL (décidé par les données du
    // compte, pas par les artefacts déployés) : bouton ET liens démo restent.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ available: false, reason: "collection_incomplete", role: null })));
    const trigger = vi.fn();
    wrapper = mountShap({ slug: "Two" }, fakeSync({ trigger }));
    await flushPromises();

    const button = wrapper.get("button.btn-refresh-shap");
    await button.trigger("click");
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".shap-demo-guidance").exists()).toBe(true);
  });

  it("n'affiche aucun bouton pendant le chargement", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    wrapper = mountShap({ slug: "Two" });

    expect(wrapper.find("button.btn-refresh-shap").exists()).toBe(false);
  });
});

describe("ShapProfile · attributs", () => {
  it("applique les attributs de scope CSS sur le template", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, reason: "role_closed", role: null })));
    wrapper = mountShap({ slug: "Two" });
    await flushPromises();

    const root = wrapper.get(".shap-container");
    const scopeAttr = Object.keys(root.attributes()).find((attr) => attr.startsWith("data-v-"));
    expect(scopeAttr).toBeDefined();
  });
});
