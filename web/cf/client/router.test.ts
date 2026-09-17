// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAppRoute, router } from "./router";

beforeEach(async () => {
  await router.replace("/");
});

describe("router", () => {
  it("résout les routes publiques et les slugs encodés", () => {
    expect(resolveAppRoute("/")).toEqual({ name: "home" });
    expect(resolveAppRoute("/readme")).toEqual({ name: "readme" });
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
});
