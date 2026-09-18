// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAppRoute, router } from "./router";

beforeEach(async () => {
  window.scrollTo = vi.fn();
  await router.replace("/");
});

describe("router", () => {
  it("résout les routes publiques et les slugs encodés", () => {
    expect(resolveAppRoute("/")).toEqual({ name: "home" });
    expect(resolveAppRoute("/readme")).toEqual({ name: "readme" });
    expect(resolveAppRoute("/case-study")).toEqual({ name: "account", slug: "spadzze" });
    expect(resolveAppRoute("/demo")).toEqual({ name: "account", slug: "spadzze" });
    expect(resolveAppRoute("/terms")).toEqual({ name: "terms" });
    expect(resolveAppRoute("/privacy")).toEqual({ name: "privacy" });
    expect(resolveAppRoute("/register/player-euw")).toEqual({
      name: "register",
      slug: "player-euw",
    });
    expect(resolveAppRoute("/c/Jean%20VG")).toEqual({
      name: "account",
      slug: "Jean VG",
    });
  });

  it("redirige une URL inconnue vers l'accueil", () => {
    expect(resolveAppRoute("/route-inconnue")).toEqual({ name: "home" });
  });

  it("pilote l'historique via Vue Router", async () => {
    await router.push("/c/player-euw");
    expect(router.currentRoute.value.name).toBe("account");
    expect(router.currentRoute.value.params.slug).toBe("player-euw");
  });

  it("remonte en haut de page lors d'un changement de chemin", () => {
    const behavior = router.options.scrollBehavior;
    expect(typeof behavior).toBe("function");
    if (behavior) {
      const to = { path: "/c/spadzze" } as any;
      const from = { path: "/" } as any;
      expect(behavior(to, from, null)).toEqual({ top: 0, left: 0 });
    }
  });

  it("préserve la position lors de l'utilisation du bouton précédent/suivant", () => {
    const behavior = router.options.scrollBehavior;
    if (behavior) {
      const to = { path: "/" } as any;
      const from = { path: "/c/spadzze" } as any;
      const savedPosition = { top: 350, left: 0 };
      expect(behavior(to, from, savedPosition)).toEqual(savedPosition);
    }
  });
});
