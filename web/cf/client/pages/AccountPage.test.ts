// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStoredAuthToken } from "../auth";
import AccountPage from "./AccountPage.vue";

/** Capture hissée : les factories vi.mock s'exécutent AVANT les imports,
 * elles ne voient que ce que vi.hoisted fournit. On garde les objets props
 * RÉACTIFS (pas une copie) : reloadToken change après le montage, les
 * assertions doivent lire sa valeur au moment du test, pas au montage. */
const captured = vi.hoisted(() => ({
  profileProps: null as Record<string, unknown> | null,
  shapProps: null as Record<string, unknown> | null,
  onDone: null as ((nGames?: number) => void) | null,
  sync: null as Record<string, unknown> | null,
  reloadPage: vi.fn(),
  routeQuery: {} as Record<string, string>,
  generateGlobal: null as (() => void) | null,
  generateGame: null as ((game: Record<string, unknown>) => void) | null,
}));

vi.mock("../page-reload", () => ({ reloadPage: captured.reloadPage }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: captured.routeQuery }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("../ingest-sync", () => ({
  useIngestSync: (_slug: unknown, opts?: { onDone?: (nGames?: number) => void }) => {
    captured.onDone = opts?.onDone ?? null;
    captured.sync = {
      syncing: false, feedback: null, cooling: false, cooldownLabel: "", trigger: () => {},
    };
    return captured.sync;
  },
}));

vi.mock("../components/AccountProfile.ce.vue", () => ({
  default: {
    props: ["slug", "total", "sync", "reloadToken"],
    setup(props: Record<string, unknown>) { captured.profileProps = props; return () => null; },
  },
}));

vi.mock("../components/ShapProfile.ce.vue", () => ({
  default: {
    props: ["slug", "sync", "reloadToken"],
    setup(props: Record<string, unknown>) { captured.shapProps = props; return () => null; },
  },
}));

vi.mock("../components/CoachingControls.ce.vue", () => ({
  default: {
    emits: ["generate"],
    setup(_props: unknown, { emit }: { emit: (event: string) => void }) {
      captured.generateGlobal = () => emit("generate");
      return () => null;
    },
  },
}));
vi.mock("../components/DemoRecruiterBanner.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/GameHistory.ce.vue", () => ({
  default: {
    emits: ["coach-game"],
    setup(_props: unknown, { emit }: { emit: (event: string, game: Record<string, unknown>) => void }) {
      captured.generateGame = game => emit("coach-game", game);
      return () => null;
    },
  },
}));
vi.mock("../components/GameReviews.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/GlobalCoaching.ce.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/JobBanner.ce.vue", () => ({ default: { render: () => null } }));

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(...frames: Array<[string, unknown]>): Response {
  return new Response(frames.map(([event, data]) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

function pageFetch(path: RequestInfo | URL): Promise<Response> {
  if (String(path).includes("/coaching-context")) {
    return Promise.resolve(jsonResponse({ main_role_scope: "adc", main_role_label: "ADC" }));
  }
  return Promise.resolve(jsonResponse({ items: [], total: 0, page: 1 }));
}

afterEach(() => {
  captured.profileProps = null;
  captured.shapProps = null;
  captured.onDone = null;
  captured.sync = null;
  captured.reloadPage.mockClear();
  captured.routeQuery = {};
  captured.generateGlobal = null;
  captured.generateGame = null;
  setStoredAuthToken(null);
  vi.unstubAllGlobals();
});

describe("AccountPage · jointure du composable de sync", () => {
  it("passe la MÊME instance de sync au hero et à l'onglet SHAP", async () => {
    // Un seul état de refresh pour toute la page (spec §6.5) : si AccountPage
    // instanciait le composable deux fois, chaque bouton poserait son propre
    // cooldown et lancer deux jobs concurrents sur la même file.
    captured.routeQuery = { tab: "shap" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1 })));
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();

    expect(captured.profileProps).not.toBeNull();
    expect(captured.shapProps).not.toBeNull();
    expect(captured.shapProps!.sync).toBe(captured.sync);
    expect(captured.profileProps!.sync).toBe(captured.shapProps!.sync);
  });

  it("recharge la page après réception du coaching global", async () => {
    captured.routeQuery = { tab: "coaching" };
    setStoredAuthToken("test-token");
    vi.stubGlobal("fetch", vi.fn((path: RequestInfo | URL) => {
      if (String(path) === "/api/coach") {
        return Promise.resolve(sseResponse(["payload", {}], ["llm", {}], ["review", { id: "r1" }]));
      }
      return pageFetch(path);
    }));
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();

    captured.generateGlobal!();
    await flushPromises();

    expect(captured.reloadPage).toHaveBeenCalledTimes(1);
  });

  it("ne recharge pas la page si le coaching global échoue", async () => {
    captured.routeQuery = { tab: "coaching" };
    setStoredAuthToken("test-token");
    vi.stubGlobal("fetch", vi.fn((path: RequestInfo | URL) => {
      if (String(path) === "/api/coach") {
        return Promise.resolve(sseResponse(["error", { error: "LLM unavailable" }]));
      }
      return pageFetch(path);
    }));
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();

    captured.generateGlobal!();
    await flushPromises();

    expect(captured.reloadPage).not.toHaveBeenCalled();
  });

  it("recharge la page après réception du coaching d'une game", async () => {
    captured.routeQuery = { tab: "history" };
    setStoredAuthToken("test-token");
    vi.stubGlobal("fetch", vi.fn((path: RequestInfo | URL) => {
      if (String(path) === "/api/coach/game") {
        return Promise.resolve(sseResponse(["payload", {}], ["llm", {}], ["review", { id: "g1" }]));
      }
      return pageFetch(path);
    }));
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();

    captured.generateGame!({ match_id: "EUW1_123" });
    await flushPromises();

    expect(captured.reloadPage).toHaveBeenCalledTimes(1);
  });

  it("recharge toute la page quand la collecte de games est terminée", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();
    // Montage : 2 appels reviews (aggregate + game) + 1 contexte + 1 compte.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(captured.profileProps!.reloadToken).toBe(0);

    captured.onDone!(12);
    await flushPromises();

    expect(captured.reloadPage).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
