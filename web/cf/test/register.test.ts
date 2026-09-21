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

  it("refuse les caracteres de structure d'URL dans le pseudo", () => {
    // Sans cette garde, le pseudo traverse le Worker jusqu'a une f-string
    // interpolee cote service et choisit l'endpoint appele avec la cle Riot.
    for (const bad of [
      "../../../lol/match/v5/matches/EUW1_1#euw",
      "a/b#euw",
      "a?queue=420#euw",
      "a%2Fb#euw",
      "a\\b#euw",
      "a\u0000b#euw",
      "a\u001fb#euw",
      "a\u007fb#euw",
    ]) {
      expect(parseRiotId(bad), bad).toBeNull();
    }
  });

  it("accepte les pseudos non latins et les espaces", () => {
    // La garde est une liste noire, pas une liste blanche latine : refuser le
    // coreen ou le cyrillique ecarterait des joueurs parfaitement legitimes.
    for (const good of ["\uAE40\uCCA0\uC218#KR1", "\u0418\u0433\u0440\u043E\u043A#RU",
                        "\u30D2\u30ED#JP1", "Le Petit Chat#euw", "Cr\u00E8me Br\u00FBl\u00E9e#EUW"]) {
      expect(parseRiotId(good), good).not.toBeNull();
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

import { apiRefresh, apiRegister, apiRegisterStatus } from "../src/register";
import { REFRESH_COOLDOWN_MS } from "../src/ingest_queue";

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

  it("refuse d'inscrire un compte curé, qui ne peut pas être ré-ingéré par un inconnu", async () => {
    // Une inscription déclenche une collecte, donc une ÉCRITURE sur le silver et
    // le gold du compte visé : sans ce refus, un étranger réécrirait les agrégats
    // d'un compte suivi, et `seed_accounts.py` n'écrivant pas de `last_ingest_ts`,
    // la fenêtre de fraîcheur ne l'en empêcherait pas au premier passage.
    const store = new Map<string, string>([["account:spadzze-euw", JSON.stringify({
      slug: "spadzze-euw", riot_id: "Spadzze#euw", region: "euw1", source: "curated",
    })]]);
    const { env, seen } = envWithQueue(store);
    const response = await apiRegister(post({ riot_id: "Spadzze#euw", platform: "euw1" }), env);
    expect(response.status).toBe(409);
    expect(seen.body).toBeUndefined();
    const body = await response.json() as { detail?: string };
    expect(body.detail).toMatch(/already tracked/);
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

describe("apiRefresh", () => {
  const curated = (extra: Record<string, unknown> = {}) => new Map<string, string>([
    ["account:spadzze", JSON.stringify({
      slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1", source: "curated", ...extra,
    })],
  ]);

  it("collecte le compte sous SON slug, pas sous celui que slugFor produirait", async () => {
    // Le coeur du bug corrigé : `slugFor("Spadzze", "euw")` vaut "spadzze-euw",
    // alors que le compte curé est enregistré sous "spadzze". Passer par
    // l'inscription collectait donc un compte fantôme à côté du vrai.
    const { env, seen } = envWithQueue(curated());
    const response = await apiRefresh(env, "spadzze");
    expect(response.status).toBe(202);
    expect(seen.body).toMatchObject({
      slug: "spadzze", riot_id: "Spadzze#euw", platform: "euw1",
    });
    expect(await response.json())
      .toMatchObject({ slug: "spadzze", status_url: "/api/register/spadzze/status" });
  });

  it("annonce la fenêtre au client plutôt que de la lui faire recopier", async () => {
    const { env } = envWithQueue(curated());
    const body = await (await apiRefresh(env, "spadzze")).json() as { cooldown?: number };
    expect(body.cooldown).toBe(REFRESH_COOLDOWN_MS / 1000);
  });

  it("refuse une deuxième collecte dans la fenêtre, sans toucher à la file", async () => {
    const { env, seen } = envWithQueue(curated({ last_ingest_ts: new Date().toISOString() }));
    const response = await apiRefresh(env, "spadzze");
    expect(response.status).toBe(429);
    expect(seen.body).toBeUndefined();
    const body = await response.json() as { retry_after?: number };
    expect(body.retry_after).toBeGreaterThan(0);
    expect(body.retry_after).toBeLessThanOrEqual(REFRESH_COOLDOWN_MS / 1000);
    expect(response.headers.get("retry-after")).toBe(String(body.retry_after));
  });

  it("rouvre la collecte une fois la fenêtre passée", async () => {
    const past = new Date(Date.now() - REFRESH_COOLDOWN_MS - 1000).toISOString();
    const { env, seen } = envWithQueue(curated({ last_ingest_ts: past }));
    expect((await apiRefresh(env, "spadzze")).status).toBe(202);
    expect(seen.body).toBeDefined();
  });

  it("traduit en 429 le refus de la file, dont l'horloge tranche en dernier", async () => {
    // KV est à cohérence finale : `last_ingest_ts` peut encore être vide alors
    // que le job vient de réussir. Le Durable Object, lui, ne se trompe pas.
    const { env } = envWithQueue(curated(), {
      state: "done", n_games: 20, updated_at: Date.now(), retry_after: 640,
    });
    const response = await apiRefresh(env, "spadzze");
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ retry_after: 640 });
  });

  it("rend 404 sur un slug inconnu sans rien mettre en file", async () => {
    const { env, seen } = envWithQueue();
    expect((await apiRefresh(env, "jamais")).status).toBe(404);
    expect(seen.body).toBeUndefined();
  });
});
