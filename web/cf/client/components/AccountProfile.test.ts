// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestSync } from "../ingest-sync";
import AccountProfile from "./AccountProfile.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AccountProfile", () => {
  it("charge l'identité, le rang et l'estimation en parallèle", async () => {
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/account")
        ? jsonResponse({ slug: "Spadzze", region: "euw1", icon: 6282, level: 758 })
        : path.endsWith("/rank")
          ? jsonResponse({ tier: "DIAMOND", division: "II", league_points: 64, wins: 12, losses: 8 })
          : jsonResponse({ predicted_rank: "master", predicted_lp: 120, proba: 0.81, n_games_used: 20 })));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(AccountProfile, { props: { slug: "Spadzze", total: 42, sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([
      "/api/c/Spadzze/account",
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
    wrapper = mount(AccountProfile, { props: { slug: "Two", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    expect(wrapper.text()).toContain("Non renseigné");
    expect(wrapper.text()).toContain("Emerald");
    expect(wrapper.emitted("predictionLoaded")?.[0]?.[0]).toMatchObject({ predicted_rank: "emerald" });
  });

  it("actualise le total sans recharger le profil", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(AccountProfile, { props: { slug: "Spadzze", total: 0, sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    await wrapper.setProps({ total: 99 });

    expect(wrapper.text()).toContain("99");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recharge le profil quand reloadToken change (fin de collecte)", async () => {
    // Le niveau et l'icône changent avec les parties : la collecte que le
    // composable déclenche doit se voir sans recharger la page. Le compteur
    // est multiplié pour rester exact quand loadProfile passera à 4 appels
    // (Task 4).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(AccountProfile, { props: { slug: "spadzze", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();
    const before = fetchMock.mock.calls.length;

    await wrapper.setProps({ reloadToken: 1 });
    await flushPromises();

    expect(fetchMock.mock.calls.length).toBe(before * 2);
  });

  it("efface l'estimation ML du compte précédent au changement de slug", async () => {
    // Réponse différée à l'infini : sans remise à zéro synchrone au changement
    // de slug, « Master » resterait affiché indéfiniment sous le pseudo du
    // nouveau compte (le bug pointé en revue : les refs survivaient au watch).
    vi.stubGlobal("fetch", vi.fn((path: string) => Promise.resolve(
      path.endsWith("/predicted-rank")
        ? jsonResponse({ predicted_rank: "master", proba: 0.81 })
        : jsonResponse({}))));
    wrapper = mount(AccountProfile, { props: { slug: "spadzze", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();
    expect(wrapper.get(".stat-ml .stat-value").text()).toBe("Master");

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await wrapper.setProps({ slug: "autre" });

    expect(wrapper.get(".stat-ml .stat-value").text()).toBe("—");
    expect(wrapper.text()).not.toContain("Master");
  });
});

describe("AccountProfile · bouton rendu depuis le composable", () => {
  const syncButton = (w: VueWrapper) => w.get("button.btn-sync-profile");

  it("grise le bouton et affiche le décompte pendant le cooldown", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    wrapper = mount(AccountProfile, {
      props: { slug: "spadzze", sync: fakeSync({ cooling: true, cooldownLabel: "À jour · 14 min" }), reloadToken: 0 },
    });

    expect(syncButton(wrapper).attributes("disabled")).toBeDefined();
    expect(syncButton(wrapper).text()).toContain("À jour · 14 min");
    expect(syncButton(wrapper).find(".sync-icon.spinning").exists()).toBe(false);
  });

  it("montre le feedback du job et le spinner pendant la sync", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    wrapper = mount(AccountProfile, {
      props: { slug: "spadzze", sync: fakeSync({ syncing: true, feedback: "Collecte en cours…" }), reloadToken: 0 },
    });

    expect(syncButton(wrapper).attributes("disabled")).toBeDefined();
    expect(syncButton(wrapper).find(".sync-icon.spinning").exists()).toBe(true);
    expect(syncButton(wrapper).text()).toContain("Collecte en cours…");
  });

  it("déclenche sync.trigger au clic, sans logique locale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const trigger = vi.fn();
    wrapper = mount(AccountProfile, {
      props: { slug: "spadzze", sync: fakeSync({ trigger }), reloadToken: 0 },
    });

    await syncButton(wrapper).trigger("click");

    expect(trigger).toHaveBeenCalledTimes(1);
  });
});

describe("AccountProfile · identité du joueur", () => {
  function stubAccount(account: unknown): void {
    vi.stubGlobal("fetch", vi.fn((path: string) => Promise.resolve(
      path.endsWith("/account") ? jsonResponse(account) : jsonResponse({}))));
  }

  const avatar = (w: VueWrapper) => w.get("img.hero-avatar").attributes("src");

  it("affiche l'icône et le niveau publiés par l'API", async () => {
    // Le bug corrigé : le composant passait la CHAÎNE du slug aux helpers, donc
    // il ne pouvait afficher qu'une valeur en dur ou un hachage, jamais la
    // donnée que la collecte venait de lire dans Match-V5.
    stubAccount({ slug: "nouveau-venu", region: "euw1", icon: 4403, level: 312 });
    wrapper = mount(AccountProfile, { props: { slug: "nouveau-venu", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    expect(avatar(wrapper)).toContain("/profileicon/4403.png");
    expect(wrapper.text()).toContain("Niv. 312");
  });

  it("n'affiche aucun niveau tant que la collecte n'en a pas rapporté", async () => {
    // Un niveau fabriqué par hachage du slug a l'air vrai : c'est ce qui le rend
    // pire qu'une absence.
    stubAccount({ slug: "nouveau-venu", region: "euw1" });
    wrapper = mount(AccountProfile, { props: { slug: "nouveau-venu", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    expect(wrapper.find("span.hero-level").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Niv.");
  });

  it("badge le serveur réel du compte, pas EUW par défaut", async () => {
    stubAccount({ slug: "faker", region: "kr", icon: 12, level: 500 });
    wrapper = mount(AccountProfile, { props: { slug: "faker", sync: fakeSync(), reloadToken: 0 } });
    await flushPromises();

    expect(wrapper.get("span.badge-region").text()).toBe("KR");
  });
});
