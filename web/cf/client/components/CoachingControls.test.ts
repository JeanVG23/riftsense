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
    expect(wrapper.text()).toContain("75 % d'erreurs jugées utiles");
    expect(wrapper.text()).toContain("objectif atteint");
  });

  it("remonte les choix sans dupliquer l'état métier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(evaluation(0.5)));
    wrapper = mount(CoachingControls, {
      props: {
        slug: "Spadzze",
        scopes: [{ id: "all", label: "Toutes" }, { id: "jinx", label: "Jinx (4)" }],
        scope: "all",
        outcome: "loss",
        authenticated: true,
        gameReviewsCount: 12,
      },
    });
    await flushPromises();

    await wrapper.findAll(".segmented-choice")[0].findAll("button")[1].trigger("click");
    await wrapper.findAll(".segmented-choice")[1].findAll("button")[1].trigger("click");
    await wrapper.get(".coach-generate").trigger("click");
    await wrapper.findAll(".coach-view-tabs button")[1].trigger("click");

    expect(wrapper.emitted("scope-change")?.[0]).toEqual(["jinx"]);
    expect(wrapper.emitted("outcome-change")?.[0]).toEqual(["win"]);
    expect(wrapper.emitted("generate")).toHaveLength(1);
    expect(wrapper.emitted("view-change")?.[0]).toEqual(["games"]);
    expect(wrapper.text()).toContain("12");
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
    expect(wrapper.text()).toContain("80 % d'erreurs jugées utiles");
  });
});
