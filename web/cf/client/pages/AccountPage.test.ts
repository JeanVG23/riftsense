// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { tab: "shap" } }),
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

vi.mock("../components/CoachingControls.ce.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/DemoRecruiterBanner.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/GameHistory.ce.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/GameReviews.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/GlobalCoaching.ce.vue", () => ({ default: { render: () => null } }));
vi.mock("../components/JobBanner.ce.vue", () => ({ default: { render: () => null } }));

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  captured.profileProps = null;
  captured.shapProps = null;
  captured.onDone = null;
  captured.sync = null;
  vi.unstubAllGlobals();
});

describe("AccountPage · jointure du composable de sync", () => {
  it("passe la MÊME instance de sync au hero et à l'onglet SHAP", async () => {
    // Un seul état de refresh pour toute la page (spec §6.5) : si AccountPage
    // instanciait le composable deux fois, chaque bouton poserait son propre
    // cooldown et lancer deux jobs concurrents sur la même file.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1 })));
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();

    expect(captured.profileProps).not.toBeNull();
    expect(captured.shapProps).not.toBeNull();
    expect(captured.shapProps!.sync).toBe(captured.sync);
    expect(captured.profileProps!.sync).toBe(captured.shapProps!.sync);
  });

  it("onDone incrémente reloadToken et recharge reviews + contexte, pas le compte", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    mount(AccountPage, { props: { slug: "Spadzze" } });
    await flushPromises();
    // Montage : 2 appels reviews (aggregate + game) + 1 contexte + 1 compte
    // (saveRecentAccount). On mémorise la part « reviews + contexte ».
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const accountCalls = fetchMock.mock.calls.filter(([path]) => String(path).includes("/account")).length;
    expect(captured.profileProps!.reloadToken).toBe(0);

    captured.onDone!(12);
    await flushPromises();

    // Reviews + contexte rechargés une fois de plus ; le compte n'est pas
    // re-demandé ; les deux enfants voient le même token incrémenté.
    expect(fetchMock.mock.calls.length - accountCalls).toBe(6);
    expect(fetchMock.mock.calls.filter(([path]) => String(path).includes("/account")).length).toBe(accountCalls);
    expect(captured.profileProps!.reloadToken).toBe(1);
    expect(captured.shapProps!.reloadToken).toBe(1);
  });
});
