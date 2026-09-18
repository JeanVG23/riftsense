// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import ShapProfile from "./ShapProfile.ce.vue";

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

describe("ShapProfile", () => {
  it("charge le rapport et crée le graphique avec les 16 principaux facteurs", async () => {
    const drivers = Array.from({ length: 18 }, (_, index) => ({
      feature: `feature_${index}`,
      contribution: index % 2 ? -index : index,
    }));
    const fetchMock = vi.fn().mockResolvedValue(response({ available: true, drivers }));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(ShapProfile, { props: { slug: "Spadzze" }, attachTo: document.body });
    await flushPromises();
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/c/Spadzze/shap");
    expect(wrapper.text()).toContain("Ce qui influence ton profil ML");
    expect(chartMock.configs).toHaveLength(1);
    expect((chartMock.configs[0].data as { labels: string[] }).labels).toHaveLength(16);
  });

  it("affiche l'état indisponible sans télécharger Chart.js", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, drivers: [] })));
    wrapper = mount(ShapProfile, { props: { slug: "Two" }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain("Profil ML indisponible");
    expect(chartMock.configs).toHaveLength(0);
  });

  it("recrée proprement le graphique lors du changement de tri", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      available: true,
      drivers: [
        { feature: "negative", contribution: -5 },
        { feature: "positive", contribution: 3 },
      ],
    })));
    wrapper = mount(ShapProfile, { props: { slug: "Spadzze" }, attachTo: document.body });
    await flushPromises();
    await flushPromises();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(chartMock.destroy).toHaveBeenCalled();
    expect((chartMock.configs.at(-1)?.data as { labels: string[] }).labels).toEqual(["positive", "negative"]);
  });

  it("applique les attributs de scope CSS sur le template", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ available: false, drivers: [] })));
    wrapper = mount(ShapProfile, { props: { slug: "Two" }, attachTo: document.body });
    await flushPromises();

    const root = wrapper.get(".shap-container");
    const scopeAttr = Object.keys(root.attributes()).find((attr) => attr.startsWith("data-v-"));
    expect(scopeAttr).toBeDefined();
  });
});
