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

  it("ne rend jamais un segment vide pour un pseudo sans caractère ASCII alphanumérique", () => {
    for (const [name, tag] of [
      ["김철수", "KR1"],
      ["Игрок", "RU"],
      ["...", "EUW"],
    ] as const) {
      const slug = slugFor(name, tag);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
      expect(slug).not.toContain("--");
    }
  });

  it("rend des slugs différents pour deux pseudos non latins différents sur la même plateforme", () => {
    expect(slugFor("김철수", "KR1")).not.toBe(slugFor("박영희", "KR1"));
    expect(slugFor("Игрок", "RU")).not.toBe(slugFor("Чемпион", "RU"));
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
}, statusHttpStatus = 200) {
  const seen: { body?: unknown; idFromNameArg?: unknown } = {};
  return {
    seen,
    store,
    env: {
      DATA: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => { store.set(key, value); },
      },
      INGEST_QUEUE: {
        idFromName: (name: string) => { seen.idFromNameArg = name; return "id"; },
        get: () => ({
          fetch: async (request: Request) => {
            if (request.method === "POST") {
              seen.body = await request.json();
              return Response.json(queueResponse);
            }
            // /status
            return statusHttpStatus === 404
              ? Response.json({ detail: "inscription inconnue" }, { status: 404 })
              : Response.json(queueResponse);
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

  it("accepte des espaces internes multiples comme équivalents au Riot ID stocké", async () => {
    const store = new Map<string, string>([["account:le-petit-chat-euw", JSON.stringify({
      slug: "le-petit-chat-euw", riot_id: "Le Petit Chat#euw", region: "euw1", source: "public",
    })]]);
    const { env } = envWithQueue(store);
    const response = await apiRegister(
      post({ riot_id: "Le  Petit  Chat#euw", platform: "euw1" }), env,
    );
    expect(response.status).not.toBe(409);
  });

  it("désigne toujours la même instance globale du Durable Object, quel que soit le slug", async () => {
    const { env, seen } = envWithQueue();
    await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env);
    expect(seen.idFromNameArg).toBe("global");
  });
});

describe("apiRegisterStatus", () => {
  it("relaie le statut du Durable Object", async () => {
    const { env } = envWithQueue(new Map(), { state: "running", updated_at: 1 });
    const response = await apiRegisterStatus(env, "spadzze-euw");
    expect(await response.json()).toMatchObject({ state: "running" });
  });

  it("retombe sur le compte quand le job a expiré du Durable Object", async () => {
    const store = new Map<string, string>([["account:spadzze-euw", JSON.stringify({
      slug: "spadzze-euw", riot_id: "Spadzze#euw", region: "euw1", source: "public",
    })]]);
    const { env } = envWithQueue(store, undefined, 404);
    const response = await apiRegisterStatus(env, "spadzze-euw");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "done", slug: "spadzze-euw" });
  });

  it("rend 404 quand ni le job ni le compte n'existent", async () => {
    const { env } = envWithQueue(new Map(), undefined, 404);
    const response = await apiRegisterStatus(env, "jamais");
    expect(response.status).toBe(404);
  });
});
