// @vitest-environment jsdom
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RIOT_PLATFORMS,
  REGISTER_ERRORS,
  useAccountRegistration,
} from "./account-registration";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("account-registration", () => {
  it("expose les constantes de plateformes et erreurs", () => {
    expect(RIOT_PLATFORMS.length).toBe(10);
    expect(REGISTER_ERRORS.riot_id_not_found).toBeDefined();
  });

  it("gère l'erreur de format de tag si requireTag est activé", async () => {
    const { riotId, error, submitRegistration } = useAccountRegistration();
    riotId.value = "PlayerWithoutTag";
    const ok = await submitRegistration({ requireTag: true });

    expect(ok).toBe(false);
    expect(error.value).toBe("Expected format: Summoner#TAG");
  });

  it("soumet l'inscription avec succès", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ slug: "player-euw", n_games: 20 }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const paths: string[] = [];
    window.addEventListener("coach-go", ((event: CustomEvent<{ path: string }>) => {
      paths.push(event.detail.path);
    }) as EventListener, { once: true });

    const { riotId, platform, submitRegistration } = useAccountRegistration();
    riotId.value = "Player#EUW";
    platform.value = "euw1";
    const ok = await submitRegistration();

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ riot_id: "Player#EUW", platform: "euw1" }),
    }));
    expect(paths).toEqual(["/register/player-euw"]);
  });
});
