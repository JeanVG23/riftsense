import { describe, expect, it } from "vitest";
import { handle, type Env } from "../src/index";
import { KEYS, type KVLike } from "../src/readers";
import { SYSTEM, SYSTEM_GAME, versionOf } from "../src/prompt";

class MemoryKV implements KVLike {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
}

const SPA_HTML = "<!doctype html><title>spa</title>";

function makeEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = {
    DATA: kv,
    ASSETS: { fetch: async () => new Response(SPA_HTML) },
    COACH_AUTH_PASSWORD: "test-auth-password",
  } as unknown as Env;
  return { env, kv };
}

async function seed(): Promise<{ env: Env; kv: MemoryKV }> {
  const { env, kv } = makeEnv();
  const [aggregatePromptVersion, gamePromptVersion] = await Promise.all([
    versionOf(SYSTEM),
    versionOf(SYSTEM_GAME),
  ]);
  await kv.put(KEYS.account("spadzze"), JSON.stringify({
    slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1", source: "curated",
  }));
  await kv.put(KEYS.accounts_index(), JSON.stringify(["spadzze"]));
  await kv.put(KEYS.games("spadzze"), [
    JSON.stringify({ match_id: "EUW1_10", champion: "Zeri", win: true }),
    JSON.stringify({ match_id: "EUW1_30", champion: "Jinx", win: false }),
    JSON.stringify({ match_id: "EUW1_20", champion: "Caitlyn", win: true }),
  ].join("\n"));
  await kv.put(KEYS.rank("spadzze"), JSON.stringify({
    tier: "MASTER", league_points: 300, fetched_at: "2026-08-30T10:00:00",
  }));
  await kv.put(KEYS.pred("spadzze"), JSON.stringify({
    predicted_rank: "master", proba: 0.61, n_games_used: 30, predicted_lp: 412,
  }));
  await kv.put(KEYS.shap("spadzze"), JSON.stringify([{ feature: "gd10", sv: 0.3 }]));
  await kv.put(KEYS.reviews("spadzze"), [
    JSON.stringify({
      ts: "2026-08-30T11:00:00", model: "kimi-k2.6",
      run: { prompt_version: aggregatePromptVersion }, review: {},
    }),
    JSON.stringify({
      ts: "2026-08-30T12:00:00", kind: "game", model: "kimi-k2.6", match_id: "EUW1_30",
      run: { prompt_version: gamePromptVersion },
      payload: { meta: { champion: "Jinx", win: false } },
      review: { strengths: [], mistakes: [{ point: "m", evidence: "12:30", cause: "c" }], next_focus: "focus", confidence: 0.7 },
    }),
    JSON.stringify({
      ts: "2026-08-29T12:00:00", kind: "game", model: "legacy-fr", match_id: "EUW1_10",
      run: { prompt_version: "legacy-french-prompt" },
      review: { mistakes: [{ point: "Ancienne analyse française" }] },
    }),
  ].join("\n"));
  await kv.put(KEYS.feedback("spadzze"), JSON.stringify({
    ts: "2026-08-30T11:00:00", items: [],
  }));
  return { env, kv };
}

describe("GET /api/accounts", () => {
  it("résume chaque compte : games_count + last_review_ts", async () => {
    const { env } = await seed();
    const r = await handle(new Request("http://x/api/accounts"), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{
      slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1",
      group: "owner",
      games_count: 3, last_review_ts: "2026-08-30T11:00:00",
    }]);
  });

  it("ne publie pas les comptes inscrits depuis le site", async () => {
    // Le Riot ID d'un visiteur n'a pas à apparaître sur la page d'accueil : il
    // s'est inscrit pour consulter ses parties, pas pour entrer dans une galerie.
    const { env, kv } = await seed();
    await kv.put(KEYS.account("visiteur-euw"), JSON.stringify({
      slug: "visiteur-euw", riot_id: "Visiteur#euw", region: "euw1", source: "public",
    }));
    await kv.put(KEYS.accounts_index(), JSON.stringify(["spadzze", "visiteur-euw"]));
    const r = await handle(new Request("http://x/api/accounts"), env);
    const body = await r.json() as Array<{ slug: string }>;
    expect(body.map((account) => account.slug)).toEqual(["spadzze"]);
  });
});

describe("GET /api/c/{slug}/account", () => {
  it("retourne l'identité d'un compte connu sans le publier dans la galerie", async () => {
    const { env, kv } = await seed();
    await kv.put(KEYS.account("visiteur-euw"), JSON.stringify({
      slug: "visiteur-euw", riot_id: "Visiteur#euw", region: "euw1", source: "public",
    }));

    const response = await handle(new Request("http://x/api/c/visiteur-euw/account"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      slug: "visiteur-euw", riot_id: "Visiteur#euw", region: "euw1",
    });
  });

  it("répond 404 pour ne pas mémoriser une URL inventée", async () => {
    const { env } = await seed();
    const response = await handle(new Request("http://x/api/c/inconnu/account"), env);
    expect(response.status).toBe(404);
  });
});

describe("POST /api/c/{slug}/refresh", () => {
  /** File factice : la recollecte doit arriver avec le slug ET le Riot ID lus en
   * KV, jamais avec ceux qu'un navigateur aurait reconstitués depuis l'URL. */
  function withQueue(env: Env): { seen: { body?: unknown } } {
    const seen: { body?: unknown } = {};
    (env as unknown as { INGEST_QUEUE: unknown }).INGEST_QUEUE = {
      idFromName: () => "id",
      get: () => ({
        fetch: async (request: Request) => {
          seen.body = await request.json();
          return Response.json({ state: "queued", position: 1, updated_at: 0 });
        },
      }),
    };
    return { seen };
  }

  it("met en file la recollecte du compte désigné par l'URL", async () => {
    const { env } = await seed();
    const { seen } = withQueue(env);
    const r = await handle(
      new Request("http://x/api/c/spadzze/refresh", { method: "POST" }), env);
    expect(r.status).toBe(202);
    expect(seen.body).toMatchObject({ slug: "spadzze", riot_id: "Spadzze#euw", platform: "euw1" });
  });

  it("405 en GET : c'est la seule écriture adressée à un compte", async () => {
    const { env } = await seed();
    withQueue(env);
    const r = await handle(new Request("http://x/api/c/spadzze/refresh"), env);
    expect(r.status).toBe(405);
  });

  it("404 sur un compte inconnu, sans rien mettre en file", async () => {
    const { env } = await seed();
    const { seen } = withQueue(env);
    const r = await handle(
      new Request("http://x/api/c/inconnu/refresh", { method: "POST" }), env);
    expect(r.status).toBe(404);
    expect(seen.body).toBeUndefined();
  });
});

describe("POST /api/chat", () => {
  it("401 si non authentifié", async () => {
    const { env } = await seed();
    const response = await handle(new Request("http://x/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "spadzze", review_ts: "2026-08-30T12:00:00", messages: [] }),
    }), env);
    expect(response.status).toBe(401);
  });

  it("route le chat et refuse une position ennemie cachée sans appeler Ollama si authentifié", async () => {
    const { env, kv } = await seed();
    const response = await handle(new Request("http://x/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-auth-password",
      },
      body: JSON.stringify({
        slug: "spadzze", review_ts: "2026-08-30T12:00:00",
        messages: [{ role: "user", content: "Où était le jungler ennemi ?" }],
      }),
    }), env);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: message");
    expect(body).toContain('"refused_hidden_info":true');
    expect(kv.store.get(KEYS.chats("spadzze"))).toContain("review_ts");
  });
});

describe("GET /api/c/{slug}/games", () => {
  it("défauts page=1 size=20, tri séquence décroissante", async () => {
    const { env } = await seed();
    const r = await handle(new Request("http://x/api/c/spadzze/games"), env);
    expect(await r.json()).toEqual({
      items: [
        { match_id: "EUW1_30", champion: "Jinx", win: false },
        { match_id: "EUW1_20", champion: "Caitlyn", win: true },
        { match_id: "EUW1_10", champion: "Zeri", win: true },
      ], page: 1, size: 20, total: 3,
    });
  });

  it("422 si page<1 ou size hors [1,200]", async () => {
    const { env } = await seed();
    for (const query of ["page=0", "size=0", "size=201", "page=abc", "size=abc"]) {
      const r = await handle(new Request(`http://x/api/c/spadzze/games?${query}`), env);
      expect(r.status).toBe(422);
      expect((await r.json() as { detail: string }).detail).toBe("page>=1 et size in [1,200]");
    }
  });

  it("slug inconnu → liste vide (pas de 404, parité FastAPI)", async () => {
    const { env } = await seed();
    expect(await (await handle(new Request("http://x/api/c/inconnu/games"), env)).json())
      .toEqual({ items: [], page: 1, size: 20, total: 0 });
  });
});

describe("GET /api/c/{slug}/rank + predicted-rank", () => {
  it("rank présent / vide structuré si absent", async () => {
    const { env } = await seed();
    expect(await (await handle(new Request("http://x/api/c/spadzze/rank"), env)).json())
      .toEqual({ tier: "MASTER", league_points: 300, fetched_at: "2026-08-30T10:00:00" });
    expect(await (await handle(new Request("http://x/api/c/inconnu/rank"), env)).json())
      .toEqual({
        tier: null, division: null, league_points: null,
        wins: null, losses: null, fetched_at: null,
      });
  });

  it("predicted-rank lit pred:{slug} (précalculé)", async () => {
    const { env } = await seed();
    expect(await (await handle(new Request("http://x/api/c/spadzze/predicted-rank"), env)).json())
      .toEqual({ predicted_rank: "master", proba: 0.61, n_games_used: 30, predicted_lp: 412 });
    expect(await (await handle(new Request("http://x/api/c/inconnu/predicted-rank"), env)).json())
      .toEqual({ predicted_rank: null, proba: null, n_games_used: 0 });
  });
});

describe("GET /api/c/{slug}/reviews|feedback|shap", () => {
  it("listes jsonl + shap structuré", async () => {
    const { env } = await seed();
    expect(await (await handle(new Request("http://x/api/c/spadzze/reviews"), env)).json())
      .toHaveLength(2);
    expect(await (await handle(new Request("http://x/api/c/spadzze/feedback"), env)).json())
      .toHaveLength(1);
    expect(await (await handle(new Request("http://x/api/c/spadzze/shap"), env)).json())
      .toEqual({ available: true, drivers: [{ feature: "gd10", sv: 0.3 }] });
    expect(await (await handle(new Request("http://x/api/c/inconnu/shap"), env)).json())
      .toEqual({ available: false, drivers: [] });
  });

  it("eval expose la métrique de la boucle d'éval", async () => {
    // Le taux publie est calcule a la lecture : une annotation laissee depuis le
    // site compte immediatement, sans attendre un sync depuis le poste local.
    const { env } = await seed();
    const report = await (await handle(new Request("http://x/api/c/spadzze/eval"), env))
      .json() as { n_game_reviews: number; objective: Record<string, unknown>; target_met: boolean };
    expect(report.n_game_reviews).toBe(2);
    expect(report.objective).toMatchObject({ target_n: 10, target_rate: 0.7 });
    expect(report.target_met).toBe(false);
  });

  it("sépare la liste légère des analyses de parties et leur détail", async () => {
    const { env } = await seed();
    const page = await handle(new Request("http://x/api/c/spadzze/reviews?kind=game&page=1&size=1"), env);
    expect(page.status).toBe(200);
    const data = await page.json() as { items: Array<Record<string, unknown>>; page: number; size: number; total: number };
    expect(data).toMatchObject({ page: 1, size: 1, total: 1 });
    expect(data.items[0]).toMatchObject({
      ts: "2026-08-30T12:00:00", kind: "game", match_id: "EUW1_30",
      summary: { strengths_count: 0, mistakes_count: 1, next_focus: "focus", confidence: 0.7 },
    });
    expect(data.items[0]).not.toHaveProperty("payload");

    const detail = await handle(new Request("http://x/api/c/spadzze/reviews/2026-08-30T12%3A00%3A00"), env);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ kind: "game", payload: { meta: { champion: "Jinx" } } });
  });

  it("valide les paramètres de pagination des reviews", async () => {
    const { env } = await seed();
    expect((await handle(new Request("http://x/api/c/spadzze/reviews?kind=game&page=0"), env)).status).toBe(422);
    expect((await handle(new Request("http://x/api/c/spadzze/reviews?kind=autre"), env)).status).toBe(422);
  });
});

describe("contexte et coaching unitaire", () => {
  it("expose le contexte complet calculé depuis KV", async () => {
    const { env } = await seed();
    const response = await handle(
      new Request("http://x/api/c/spadzze/coaching-context"), env,
    );
    expect(response.status).toBe(200);
    const context = await response.json() as Record<string, any>;
    expect(context).toHaveProperty("default_scope");
    expect(context).toHaveProperty("matches.EUW1_30.review_status");
    expect(context).toHaveProperty("review_samples.adc");
    expect(context).toHaveProperty("aggregate_status.adc.loss");
  });

  it("exige l'authentification puis valide le body et la configuration avant d'ouvrir le flux unitaire", async () => {
    const { env } = await seed();
    const unauthed = await handle(new Request("http://x/api/coach/game", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), env);
    expect(unauthed.status).toBe(401);

    const invalid = await handle(new Request("http://x/api/coach/game", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-auth-password",
      },
      body: "{}",
    }), env);
    expect(invalid.status).toBe(422);

    const missingKey = await handle(new Request("http://x/api/coach/game", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-auth-password",
      },
      body: JSON.stringify({ slug: "spadzze", match_id: "EUW1_30" }),
    }), env);
    expect(missingKey.status).toBe(500);
    expect(await missingKey.json()).toEqual({ detail: "OLLAMA_API_KEY is not configured" });
  });

  it("POST /api/coach: 401 si non authentifié", async () => {
    const { env } = await seed();
    const res = await handle(new Request("http://x/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "spadzze" }),
    }), env);
    expect(res.status).toBe(401);
  });
});

describe("routes API inconnues", () => {
  it("POST /api/fetch et GET /api/jobs/{id} n'existent plus (V1)", async () => {
    const { env } = await seed();
    const r1 = await handle(new Request("http://x/api/fetch", { method: "POST", body: "{}" }), env);
    const r2 = await handle(new Request("http://x/api/jobs/abc"), env);
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });
});
