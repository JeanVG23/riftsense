// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import GameReviews from "./GameReviews.vue";

const summary = {
  ts: "2026-09-17T10:00:00Z",
  match_id: "EUW1_42",
  payload: { meta: { match_id: "EUW1_42", champion: "Kai'Sa", opponent: "Jinx", win: false, patch: "16.17", duration_min: 28, kda: { kills: 5, deaths: 3, assists: 7 } } },
};
const detail = {
  ...summary,
  review: {
    confidence: 0.8,
    summary: "Une partie jouable malgré un tempo perdu.",
    next_focus: "Revenir avant l'objectif.",
    strengths: [{ point: "Bon spacing : portée respectée", evidence: "08:15" }],
    mistakes: [{ point: "Back tardif : tempo perdu", cause: "Achat décalé", evidence: "14:20" }],
    axes: [],
  },
};

let wrapper: VueWrapper | null = null;
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals(); });

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("GameReviews", () => {
  it("charge le détail, rend les filtres et conserve toute la map de feedback", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(detail))
      .mockResolvedValueOnce(json([{ ts: detail.ts, items: [{ kind: "mistake", index: 0, useful: false, tag: "trop-vague" }] }]))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(GameReviews, { props: { slug: "Spadzze", reviews: [summary], total: 1 } });
    await flushPromises();

    expect(wrapper.text()).toContain("Kai'Sa");
    expect(wrapper.text()).toContain("Back tardif");
    expect(wrapper.text()).toContain("80%");
    await wrapper.findAll(".game-focus-card .fb-btn-compact")[0].trigger("click");
    await flushPromises();

    const options = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({ responses: {
      "mistake,0": { useful: false, tag: "trop-vague" },
      "focus,0": { useful: true },
    } });
    expect(wrapper.emitted("feedback-saved")).toHaveLength(1);
  });

  it("pagine jusqu'à la cible d'un lien profond", async () => {
    const targetSummary = { ...summary, ts: "2026-09-16T10:00:00Z", match_id: "EUW1_99", payload: { meta: { ...summary.payload.meta, match_id: "EUW1_99", champion: "Jinx" } } };
    const targetDetail = { ...detail, ...targetSummary };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ items: [targetSummary], total: 2, page: 2 }))
      .mockResolvedValueOnce(json(targetDetail))
      .mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(GameReviews, { props: { slug: "Spadzze", reviews: [summary], total: 2, targetMatchId: "EUW1_99" } });
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toContain("kind=game&page=2");
    expect(wrapper.text()).toContain("Jinx");
    expect(wrapper.emitted("reviews-loaded")?.[0]?.[0]).toMatchObject({ total: 2, page: 2 });
  });

  it("publie le match choisi pour garder l'URL partageable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(detail)).mockResolvedValueOnce(json([])));
    wrapper = mount(GameReviews, { props: { slug: "Spadzze", reviews: [summary], total: 1 } });
    await flushPromises();
    await wrapper.get(".game-review-option").trigger("click");
    expect(wrapper.emitted("review-select")?.[0]).toEqual(["EUW1_42"]);
  });

  it("affiche le titre et la catégorie structurés avec repli legacy", async () => {
    const structured = {
      ...detail,
      review: {
        ...detail.review,
        mistakes: [{
          title: "Recall tardif avant drake",
          category: "ECONOMIE_RECALL",
          point: "Reset before the objective instead of extending one wave.",
          cause: "The visit lost lane tempo.",
          evidence: "14:20",
        }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(structured)).mockResolvedValueOnce(json([])));
    wrapper = mount(GameReviews, { props: { slug: "Spadzze", reviews: [summary], total: 1 } });
    await flushPromises();
    expect(wrapper.get(".insight-cat").text()).toBe("Recalls");
    expect(wrapper.text()).toContain("Recall tardif avant drake");
    expect(wrapper.text()).toContain("Reset before the objective");
  });

  it("compile avec les styles scoped de Vue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(detail)).mockResolvedValueOnce(json([])));
    wrapper = mount(GameReviews, { props: { slug: "Spadzze", reviews: [summary], total: 1 } });
    await flushPromises();
    expect(Object.keys(wrapper!.element.attributes).some(k => wrapper!.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });
});
