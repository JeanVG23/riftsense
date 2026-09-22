// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoachingControls from "./CoachingControls.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

function evaluation(rate: number): Response {
  return new Response(JSON.stringify({
    target_met: rate >= 0.7,
    objective: { mistake_useful_rate: rate, n_game_reviews_annotated: 8, target_n: 10 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("CoachingControls", () => {
  it("charge et publie la mesure de qualité", async () => {
    const fetchMock = vi.fn().mockResolvedValue(evaluation(0.75));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(CoachingControls, { props: { slug: "Spadzze" } });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/c/Spadzze/eval",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(wrapper.text()).toContain("75% of mistakes rated useful");
    expect(wrapper.text()).toContain("target met");
    const attrs = wrapper.element.attributes;
    expect(Object.keys(attrs).some(k => attrs[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("affiche le rôle principal partagé avec le SHAP sans sélecteur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(evaluation(0.5)));
    wrapper = mount(CoachingControls, {
      props: {
        slug: "Spadzze",
        mainRoleName: "ADC",
        roleReady: true,
        authenticated: true,
        gameReviewsCount: 12,
      },
    });
    await flushPromises();

    await wrapper.get(".coach-generate").trigger("click");
    await wrapper.findAll(".coach-view-tabs button")[1].trigger("click");

    expect(wrapper.emitted("generate")).toHaveLength(1);
    expect(wrapper.emitted("view-change")?.[0]).toEqual(["games"]);
    expect(wrapper.text()).toContain("Main role detected");
    expect(wrapper.text()).toContain("ADC");
    expect(wrapper.find(".segmented-choice").exists()).toBe(false);
    expect(wrapper.text()).toContain("12");
  });

  it("bloque la génération tant que le rôle principal manque", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(evaluation(0.5)));
    wrapper = mount(CoachingControls, { props: { slug: "Spadzze" } });
    await flushPromises();
    expect(wrapper.get(".coach-generate").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Refresh required");
  });

  it("recalcule l'évaluation après un vote", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(evaluation(0.5))
      .mockResolvedValueOnce(evaluation(0.8));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(CoachingControls, { props: { slug: "Spadzze", evalRevision: 0 } });
    await flushPromises();

    await wrapper.setProps({ evalRevision: 1 });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("80% of mistakes rated useful");
  });
});
