// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalCoaching from "./GlobalCoaching.ce.vue";

const review = {
  ts: "2026-09-17T10:00:00Z",
  model: "coach-model",
  scope: "adc",
  outcome_focus: "overall",
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
  it("rend le bilan sans les métadonnées techniques", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, {
      props: { slug: "Spadzze", review, reviews: [review], scope: "adc", scopeName: "ADC" },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("20 games analyzed");
    expect(wrapper.text()).not.toContain("Statistical basis");
    expect(wrapper.text()).not.toContain("Main role · ADC");
    expect(wrapper.text()).not.toContain("Refresh coaching");
    expect(wrapper.text()).toContain("Back tardif");
    expect(wrapper.text()).not.toContain("tempo perdu");
    expect(wrapper.text()).toContain("Confidence");
    expect(wrapper.text()).toContain("82%");
  });

  it("replie les insights avec le même geste que la vue par game", async () => {
    // Deux idiomes d'interaction sur deux onglets de la même fonctionnalité
    // coûteraient plus cher que le texte qu'on économise ici.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review } });
    await flushPromises();

    expect(wrapper.text()).not.toContain("bonne distance");
    expect(wrapper.text()).not.toContain("pense aux balises");
    await wrapper.get(".insight-col .insight-toggle").trigger("click");
    expect(wrapper.text()).toContain("bonne distance");
    expect(wrapper.text()).toContain("7 parties");
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

  it("compile avec les styles scoped de Vue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, {
      props: { slug: "Spadzze", review, reviews: [review], scope: "adc", scopeName: "ADC" },
    });
    await flushPromises();
    expect(Object.keys(wrapper!.element.attributes).some(k => wrapper!.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("ne publie le focus qu'une fois", async () => {
    // Il était rendu dans le hero ET dans une quatrième colonne « Focus &
    // Confidence » : la même phrase, deux fois, sur le même écran.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, reviews: [review] } });
    await flushPromises();

    expect(wrapper.text().split("Sécuriser le niveau 2")).toHaveLength(2);
    expect(wrapper.findAll(".insight-col")).toHaveLength(3);
    expect(wrapper.get(".global-focus-hero").text()).toContain("82%");
  });

  it("rend la grille de récurrence, une colonne par partie dans l'ordre du temps", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    const gameReviews = [
      { match_id: "G3", meta: { win: false }, summary: { categories: ["POSITIONNEMENT_COMBAT", "OBJECTIFS"] } },
      { match_id: "G2", meta: { win: true }, summary: { categories: ["POSITIONNEMENT_COMBAT"] } },
      { match_id: "G1", meta: { win: false }, summary: { categories: ["POSITIONNEMENT_COMBAT"] } },
    ];
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, reviews: [review], gameReviews } });
    await flushPromises();

    const rows = wrapper.findAll(".recurrence-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Fight positioning");
    expect(rows[0].text()).toContain("3 of 3");
    const cells = rows[1].findAll(".recurrence-cell");
    expect(cells.map(cell => cell.attributes("data-match"))).toEqual(["G1", "G2", "G3"]);
    expect(cells.map(cell => cell.classes().includes("is-hit"))).toEqual([false, false, true]);
  });

  it("renvoie vers la partie quand on clique une présence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    const gameReviews = [{ match_id: "G1", meta: { win: false }, summary: { categories: ["OBJECTIFS"] } }];
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, reviews: [review], gameReviews } });
    await flushPromises();

    await wrapper.get(".recurrence-cell.is-hit").trigger("click");
    expect(wrapper.emitted("game-select")?.[0]).toEqual(["G1"]);
  });

  it("tait la grille quand aucune partie ne porte de catégorie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, {
      props: { slug: "Spadzze", review, reviews: [review], gameReviews: [{ match_id: "G1", meta: {}, summary: {} }] },
    });
    await flushPromises();
    expect(wrapper.find(".recurrence-grid").exists()).toBe(false);
  });

  const withMoments = [
    { match_id: "G1", meta: { win: false }, summary: { categories: ["OBJECTIFS"], moments: [
      { at: 3, kind: "mistake" }, { at: 9, kind: "mistake" }, { at: 20, kind: "mistake" },
    ] } },
    { match_id: "G2", meta: { win: true }, summary: { categories: [], moments: [
      { at: 9, kind: "mistake" }, { at: 20, kind: "strength" },
    ] } },
    { match_id: "G3", meta: { win: false }, summary: { categories: [], moments: [{ at: 20, kind: "mistake" }] } },
  ];

  it("superpose les frises des parties sur un seul axe absolu", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, gameReviews: withMoments } });
    await flushPromises();

    const marks = wrapper.findAll(".global-timeline-mark");
    expect(marks).toHaveLength(6);
    expect(marks.filter(mark => mark.classes().includes("is-strength"))).toHaveLength(1);
    // Axe planché à 30 minutes : 20:00 tombe aux deux tiers.
    expect(marks.at(-1)?.attributes("style")).toContain("66.6");
  });

  it("nomme chaque bande de phase avec son compte", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, gameReviews: withMoments } });
    await flushPromises();

    const bands = wrapper.findAll(".phase-band");
    expect(bands).toHaveLength(4);
    expect(bands.map(band => band.attributes("data-band"))).toEqual(["very_early", "laning", "mid", "late"]);
    expect(bands[1].text()).toContain("5-15");
    expect(bands[1].text()).toContain("2");
    // La largeur suit la DURÉE de la bande, jamais son compte : sans quoi on
    // aurait refait un diagramme en barres.
    expect(bands[1].attributes("style")).toContain("33.3");
  });

  it("annonce une concentration, pas un classement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, { props: { slug: "Spadzze", review, gameReviews: withMoments } });
    await flushPromises();

    const trend = wrapper.get(".global-timeline-trend").text();
    expect(trend).toContain("4 of 5");
    expect(trend).toContain("5 and 25 minutes");
  });

  it("tait la frise quand aucune partie ne publie d'instant", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    wrapper = mount(GlobalCoaching, {
      props: { slug: "Spadzze", review, gameReviews: [{ match_id: "G1", meta: {}, summary: {} }] },
    });
    await flushPromises();
    expect(wrapper.find(".global-timeline").exists()).toBe(false);
  });
});
