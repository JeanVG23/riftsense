// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountProfile from "./AccountProfile.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AccountProfile", () => {
  it("charge le rang et l'estimation en parallèle", async () => {
    const fetchMock = vi.fn((path: string) => Promise.resolve(path.endsWith("/rank")
      ? jsonResponse({ tier: "DIAMOND", division: "II", league_points: 64, wins: 12, losses: 8 })
      : jsonResponse({ predicted_rank: "master", predicted_lp: 120, proba: 0.81, n_games_used: 20 })));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(AccountProfile, { props: { slug: "Spadzze", total: 42 } });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([
      "/api/c/Spadzze/rank",
      "/api/c/Spadzze/predicted-rank",
    ]));
    expect(wrapper.text()).toContain("Diamond II · 64 LP");
    expect(wrapper.text()).toContain("12V 8D · 60% WR");
    expect(wrapper.text()).toContain("Confiance 81%");
    expect(wrapper.text()).toContain("42");
    expect(wrapper.emitted("predictionLoaded")?.[0]?.[0]).toMatchObject({ predicted_rank: "master" });
  });

  it("isole l'échec du rang de la prédiction ML", async () => {
    vi.stubGlobal("fetch", vi.fn((path: string) => Promise.resolve(path.endsWith("/rank")
      ? jsonResponse({ error: "unavailable" }, 503)
      : jsonResponse({ predicted_rank: "emerald", proba: 0.7 }))));

    wrapper = mount(AccountProfile, { props: { slug: "Two" } });
    await flushPromises();

    expect(wrapper.text()).toContain("Non renseigné");
    expect(wrapper.text()).toContain("Emerald");
    expect(wrapper.emitted("predictionLoaded")?.[0]?.[0]).toMatchObject({ predicted_rank: "emerald" });
  });

  it("actualise le total sans recharger le profil", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(AccountProfile, { props: { slug: "Spadzze", total: 0 } });
    await flushPromises();

    await wrapper.setProps({ total: 99 });

    expect(wrapper.text()).toContain("99");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
