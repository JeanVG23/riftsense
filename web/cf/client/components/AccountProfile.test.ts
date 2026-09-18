// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountProfile from "./AccountProfile.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // La fenêtre de rafraîchissement est mémorisée par slug : sans ce nettoyage,
  // un test qui la pose griserait le bouton des suivants.
  localStorage.clear();
});

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

    wrapper = mount(AccountProfile, { props: { slug: "Spadzze", total: 42 } });
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
    const attrs = wrapper.element.attributes;
    expect(Object.keys(attrs).some(k => attrs[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("AccountProfile · bouton Actualiser", () => {
  const syncButton = (w: VueWrapper) => w.get("button.btn-sync-profile");

  function stubFetch(refresh: Response): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh") ? refresh : jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("poste sur le slug du compte, jamais sur un Riot ID reconstitué", async () => {
    // Le bug corrigé : le composant postait sur /api/register avec
    // `${slug}#euw`, ce qui désigne "spadzze-euw" et fait collecter un compte
    // fantôme à côté du compte curé "spadzze".
    const fetchMock = stubFetch(jsonResponse({ state: "queued", cooldown: 900 }, 202));
    wrapper = mount(AccountProfile, { props: { slug: "spadzze" } });
    await flushPromises();

    await syncButton(wrapper).trigger("click");
    await flushPromises();

    const call = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/refresh"));
    expect(call?.[0]).toBe("/api/c/spadzze/refresh");
    expect((call?.[1] as RequestInit | undefined)?.method).toBe("POST");
    expect(fetchMock.mock.calls.some(([path]) => String(path) === "/api/register")).toBe(false);
  });

  it("grise le bouton pour la durée que le serveur annonce dans son 429", async () => {
    const fetchMock = stubFetch(jsonResponse({ detail: "déjà à jour", retry_after: 900 }, 429));
    wrapper = mount(AccountProfile, { props: { slug: "spadzze" } });
    await flushPromises();

    await syncButton(wrapper).trigger("click");
    await flushPromises();
    const callsAfterRefusal = fetchMock.mock.calls.length;

    // Le bouton porte d'abord le message du serveur ; le décompte prend sa place
    // quand ce message s'efface (couvert par le test de rechargement ci-dessous).
    expect(syncButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Données déjà à jour");

    // Deuxième clic : plus aucun appel, le refus est déjà connu.
    await syncButton(wrapper).trigger("click");
    await flushPromises();
    expect(fetchMock.mock.calls.length).toBe(callsAfterRefusal);
  });

  it("retrouve la fenêtre après un rechargement de page", async () => {
    localStorage.setItem("riftsense:refresh:spadzze", String(Date.now() + 5 * 60 * 1000));
    const fetchMock = stubFetch(jsonResponse({}, 202));
    wrapper = mount(AccountProfile, { props: { slug: "spadzze" } });
    await flushPromises();

    expect(syncButton(wrapper).attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("5 min");
    await syncButton(wrapper).trigger("click");
    await flushPromises();
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith("/refresh"))).toBe(false);
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
    wrapper = mount(AccountProfile, { props: { slug: "nouveau-venu" } });
    await flushPromises();

    expect(avatar(wrapper)).toContain("/profileicon/4403.png");
    expect(wrapper.text()).toContain("Niv. 312");
  });

  it("n'affiche aucun niveau tant que la collecte n'en a pas rapporté", async () => {
    // Un niveau fabriqué par hachage du slug a l'air vrai : c'est ce qui le rend
    // pire qu'une absence.
    stubAccount({ slug: "nouveau-venu", region: "euw1" });
    wrapper = mount(AccountProfile, { props: { slug: "nouveau-venu" } });
    await flushPromises();

    expect(wrapper.find("span.hero-level").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Niv.");
  });

  it("badge le serveur réel du compte, pas EUW par défaut", async () => {
    stubAccount({ slug: "faker", region: "kr", icon: 12, level: 500 });
    wrapper = mount(AccountProfile, { props: { slug: "faker" } });
    await flushPromises();

    expect(wrapper.get("span.badge-region").text()).toBe("KR");
  });

  it("recharge l'identité après une synchronisation réussie", async () => {
    // Le niveau et l'icône changent avec les parties : la collecte que le bouton
    // déclenche doit se voir sans recharger la page.
    // Le suivi du job dort POLL_INTERVAL_MS avant son premier sondage : sans
    // horloge simulée, ce test attendrait trois secondes réelles.
    vi.useFakeTimers();
    let level = 312;
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/account")
        ? jsonResponse({ slug: "spadzze", region: "euw1", icon: 4403, level })
        : path.endsWith("/refresh")
          ? jsonResponse({ state: "done", n_games: 20, cooldown: 900 }, 202)
          : jsonResponse({ state: "done", n_games: 20 })));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(AccountProfile, { props: { slug: "spadzze" } });
    await flushPromises();
    expect(wrapper.text()).toContain("Niv. 312");

    level = 313;
    await wrapper.get("button.btn-sync-profile").trigger("click");
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();

    expect(wrapper.text()).toContain("20 parties synchronisées");
    expect(wrapper.text()).toContain("Niv. 313");
  });
});
