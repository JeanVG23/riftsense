// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalCoaching from "./GlobalCoaching.ce.vue";

const review = {
  ts: "2026-09-17T10:00:00Z",
  model: "coach-model",
  scope: "adc",
  outcome_focus: "loss",
  payload: { meta: {
    n_games_me: 20,
    n_games_ref: 100,
    winrate_me: 0.55,
    n_game_reviews_available: 4,
    n_game_reviews_available_wins: 1,
    n_game_reviews_available_losses: 3,
  } },
  review: {
    strengths: [{ point: "Positionnement : bonne distance", evidence: "7 parties" }],
    mistakes: [{ point: "Erreur 1 : Back tardif — tempo perdu", evidence: "4 parties" }],
    habits: ["Vision faible : pense aux balises"],
    next_focus: "Sécuriser le niveau 2",
    confidence: 0.82,
  },
};

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("GlobalCoaching", () => {
  it("rend le bilan et sa transparence statistique", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, {
      props: { slug: "Spadzze", review, reviews: [review], scopeName: "ADC", outcome: "loss" },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("20 parties analysées");
    expect(wrapper.text()).toContain("55%");
    expect(wrapper.text()).toContain("Back tardif");
    expect(wrapper.text()).toContain("tempo perdu");
    expect(wrapper.text()).toContain("Confiance");
    expect(wrapper.text()).toContain("82%");
  });

  it("préserve tous les votes lors de l'enregistrement", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([{ ts: review.ts, items: [
        { kind: "strength", index: 0, useful: false, tag: "trop-vague" },
      ] }]))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review } });
    await flushPromises();

    await wrapper.get(".global-focus-actions button").trigger("click");
    await flushPromises();

    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe("/api/feedback");
    expect(JSON.parse(String(options.body))).toMatchObject({
      responses: {
        "strength,0": { useful: false, tag: "trop-vague" },
        "focus,0": { useful: true },
      },
    });
    expect(wrapper.emitted("feedback-saved")).toHaveLength(1);
  });

  it("ouvre les motifs de rejet et remonte le choix d'une ancienne review", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    const oldReview = { ...review, ts: "2026-09-10T10:00:00Z", model: "older" };
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, reviews: [review, oldReview] } });
    await flushPromises();

    await wrapper.findAll(".global-focus-actions button")[1].trigger("click");
    expect(wrapper.findAll(".tag-opt").length).toBeGreaterThan(0);
    await wrapper.get("button.hist-row").trigger("click");
    expect(wrapper.emitted("review-select")?.[0]?.[0]).toMatchObject({ ts: oldReview.ts });
  });
});
