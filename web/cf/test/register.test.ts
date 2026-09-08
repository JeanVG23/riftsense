import { describe, expect, it } from "vitest";
import { PLATFORMS, parseRiotId, slugFor } from "../src/register";

describe("parseRiotId", () => {
  it("accepte un Riot ID bien formé", () => {
    expect(parseRiotId("Spadzze#euw")).toEqual({ gameName: "Spadzze", tagLine: "euw" });
  });

  it("tolère les espaces autour et dans le pseudo", () => {
    expect(parseRiotId("  Le Petit Chat#EUW1 ")).toEqual({
      gameName: "Le Petit Chat", tagLine: "EUW1",
    });
  });

  it("refuse ce qui n'est pas un Riot ID", () => {
    for (const bad of ["", "Spadzze", "#euw", "Spadzze#", "a#b#c", "Sp#euw#", "  #  "]) {
      expect(parseRiotId(bad), bad).toBeNull();
    }
  });
});

describe("slugFor", () => {
  it("porte le tag, pour que deux pseudos identiques ne se collisionnent pas", () => {
    expect(slugFor("Spadzze", "euw")).toBe("spadzze-euw");
    expect(slugFor("Spadzze", "NA1")).toBe("spadzze-na1");
  });

  it("normalise accents, espaces et ponctuation", () => {
    expect(slugFor("Créme Brûlée", "EUW")).toBe("creme-brulee-euw");
    expect(slugFor("A..B", "euw")).toBe("a-b-euw");
  });

  it("ne produit ni tiret en tête ni tiret en queue", () => {
    expect(slugFor(" _Zed_ ", "euw")).toBe("zed-euw");
  });
});

describe("PLATFORMS", () => {
  it("contient les plateformes servies", () => {
    expect(PLATFORMS).toContain("euw1");
    expect(PLATFORMS).toContain("na1");
    expect(PLATFORMS).toContain("kr");
  });
});

import { apiRegister, apiRegisterStatus } from "../src/register";

function envWithQueue(store = new Map<string, string>(), queueResponse: unknown = {
  state: "queued", position: 1, updated_at: 0,
}) {
  const seen: { body?: unknown } = {};
  return {
    seen,
    store,
    env: {
      DATA: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => { store.set(key, value); },
      },
      INGEST_QUEUE: {
        idFromName: () => "id",
        get: () => ({
          fetch: async (request: Request) => {
            if (request.method === "POST") seen.body = await request.json();
            return Response.json(queueResponse);
          },
        }),
      },
    } as never,
  };
}

const post = (body: unknown) =>
  new Request("http://x/api/register", { method: "POST", body: JSON.stringify(body) });

describe("apiRegister", () => {
  it("accepte une inscription et rend 202 avec l'URL de statut", async () => {
    const { env, seen } = envWithQueue();
    const response = await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env);
    expect(response.status).toBe(202);
    const body = await response.json() as Record<string, unknown>;
    expect(body.slug).toBe("spadzze-euw");
    expect(body.status_url).toBe("/api/register/spadzze-euw/status");
    expect(seen.body).toMatchObject({ slug: "spadzze-euw", platform: "euw1" });
  });

  it("refuse un Riot ID mal formé sans toucher à la file", async () => {
    const { env, seen } = envWithQueue();
    const response = await apiRegister(post({ riot_id: "Spadzze", platform: "euw1" }), env);
    expect(response.status).toBe(422);
    expect(seen.body).toBeUndefined();
  });

  it("refuse une plateforme inconnue", async () => {
    const { env } = envWithQueue();
    const response = await apiRegister(post({ riot_id: "A#euw", platform: "mars1" }), env);
    expect(response.status).toBe(422);
  });

  it("rend les données existantes sans collecter dans la fenêtre de fraîcheur", async () => {
    const store = new Map<string, string>([["account:spadzze-euw", JSON.stringify({
      slug: "spadzze-euw", riot_id: "Spadzze#euw", region: "euw1", source: "public",
      last_ingest_ts: new Date().toISOString(),
    })]]);
    const { env, seen } = envWithQueue(store);
    const response = await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "done", fresh: true });
    expect(seen.body).toBeUndefined();
  });

  it("recollecte quand la fenêtre de fraîcheur est passée", async () => {
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const store = new Map<string, string>([["account:spadzze-euw", JSON.stringify({
      slug: "spadzze-euw", riot_id: "Spadzze#euw", region: "euw1", source: "public",
      last_ingest_ts: old,
    })]]);
    const { env, seen } = envWithQueue(store);
    expect((await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env)).status)
      .toBe(202);
    expect(seen.body).toBeDefined();
  });

  it("refuse un slug déjà pris par un autre Riot ID", async () => {
    const store = new Map<string, string>([["account:spadzze-euw", JSON.stringify({
      slug: "spadzze-euw", riot_id: "Autre#euw", region: "euw1", source: "curated",
    })]]);
    const { env } = envWithQueue(store);
    const response = await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env);
    expect(response.status).toBe(409);
  });
});

describe("apiRegisterStatus", () => {
  it("relaie le statut du Durable Object", async () => {
    const { env } = envWithQueue(new Map(), { state: "running", updated_at: 1 });
    const response = await apiRegisterStatus(env, "spadzze-euw");
    expect(await response.json()).toMatchObject({ state: "running" });
  });
});
