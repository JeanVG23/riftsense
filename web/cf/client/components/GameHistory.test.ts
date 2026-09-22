// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import GameHistory from "./GameHistory.ce.vue";

const firstGame = {
  match_id: "EUW1_42",
  champion: "Kai'Sa",
  win: false,
  patch: "16.17",
  game_ts: 1786379613694,
  queue: 420,
  role: "BOTTOM",
  kills: [{ minute: 8, victim_champ: "Jinx" }],
  deaths: [{ minute: 4, killer_champ: "Nautilus" }],
  assists: [{ minute: 8, victim_champ: "Jinx", killer_champ: "Leona" }],
  lane: { opponent: "Jinx", gd14: -240 },
  position: { wards_placed: 7 },
  objectives: [],
};

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

function page(items = [firstGame], total = items.length): Response {
  return new Response(JSON.stringify({ items, total, page: 1, size: 20 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("GameHistory", () => {
  it("charge la page et remonte son total au tableau de bord", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([firstGame], 21));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(GameHistory, {
      props: {
        slug: "Spadzze",
        predictedRank: { predicted_rank: "diamond", predicted_lp: 40, proba: 0.75, n_games_used: 20 },
      },
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/c/Spadzze/games?page=1&size=20",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(wrapper.text()).toContain("Kai'Sa");
    expect(wrapper.text()).toContain("1/1/1 · 2.00");
    expect(wrapper.text()).toContain("Recent games");
    expect(wrapper.text()).toContain("Aug 10, 2026");
    expect(wrapper.emitted("gamesLoaded")?.[0]?.[0]).toMatchObject({ total: 21 });
  });

  it("ouvre les détails au clavier et transmet l'action de coaching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page()));
    wrapper = mount(GameHistory, {
      props: {
        slug: "Spadzze",
        authenticated: true,
        coachingContext: { matches: { EUW1_42: { analyzable: true } } },
      },
    });
    await flushPromises();

    await wrapper.get(".game-row").trigger("keydown.enter");
    expect(wrapper.get(".game-details-panel").isVisible()).toBe(true);
    await wrapper.get(".btn-coach-shortcut").trigger("click");
    expect(wrapper.emitted("coachGame")?.[0]?.[0]).toMatchObject({ match_id: "EUW1_42" });
  });

  it("pagine sans laisser le parent refaire la requête", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page([firstGame], 21))
      .mockResolvedValueOnce(page([{ ...firstGame, match_id: "EUW1_43", champion: "Jinx" }], 21));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(GameHistory, { props: { slug: "Spadzze" } });
    await flushPromises();

    await wrapper.get('[data-testid="next-page"]').trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toBe("/api/c/Spadzze/games?page=2&size=20");
    expect(wrapper.text()).toContain("Jinx");
    expect(wrapper.text()).toContain("page 2 / 2");
  });

  it("compile avec les styles scoped de Vue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page()));
    wrapper = mount(GameHistory, { props: { slug: "Spadzze" } });
    await flushPromises();
    expect(Object.keys(wrapper!.element.attributes).some(k => wrapper!.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("explique pourquoi une game n'est pas analysable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page()));
    wrapper = mount(GameHistory, {
      props: {
        slug: "Spadzze",
        authenticated: true,
        coachingContext: { matches: { EUW1_42: {
          analyzable: false,
          analysis_unavailable_reason: "outside_window",
        } } },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Analysis is available for the latest 50 games");
    expect(wrapper.get(".btn-coach-shortcut").attributes("disabled")).toBeDefined();
  });
});
