import { listAccounts } from "./accounts";
import { apiCoach } from "./coach";
import { apiGameCoach } from "./game_coach";
import { CoachGate } from "./coach_gate";
import { apiChat } from "./chat";
import { buildCoachingContext } from "./coaching_context";
import { readEval } from "./evaluation";
import { apiFeedback } from "./feedback";
import { apiAuthStatus, apiLogin, apiLogout, isAuthorized } from "./auth";
import {
  methodNotAllowed,
  notFound,
  pageParams,
  paginate,
  pagingError,
  unauthorized,
  unprocessable,
} from "./http";
import {
  KEYS,
  readGames,
  readJsonl,
  readPred,
  readRank,
  readShap,
  type KVLike,
} from "./readers";

export interface Env {
  DATA: KVLike;
  ASSETS: Fetcher;
  COACH_GATE?: DurableObjectNamespace;
  OLLAMA_API_KEY?: string;
  OLLAMA_MODEL?: string;
  COACH_AUTH_PASSWORD?: string;
  INGEST_URL?: string;
  INGEST_SECRET?: string;
}

export { CoachGate };

async function gatedCoach(
  request: Request,
  env: Env,
  direct: (request: Request, env: Env) => Promise<Response>,
): Promise<Response> {
  const body = await request.clone().json().catch(() => null) as { slug?: unknown } | null;
  if (!env.COACH_GATE || typeof body?.slug !== "string" || !body.slug) {
    return direct(request, env);
  }
  const id = env.COACH_GATE.idFromName(body.slug);
  return env.COACH_GATE.get(id).fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};

const EMPTY_RANK = {
  tier: null,
  division: null,
  league_points: null,
  wins: null,
  losses: null,
  fetched_at: null,
};
const EMPTY_PRED = { predicted_rank: null, proba: null, n_games_used: 0 };

type StoredReview = Record<string, unknown> & {
  ts?: string;
  kind?: string;
  model?: string;
  match_id?: string;
  payload?: unknown;
  review?: unknown;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const GAMES_MAX_SIZE = 200;

function gameReviewSummary(item: StoredReview): Record<string, unknown> {
  const payload = recordOf(item.payload);
  const meta = recordOf(payload?.meta) ?? {};
  const review = recordOf(item.review);
  return {
    ts: item.ts ?? null,
    model: item.model ?? null,
    kind: "game",
    match_id: item.match_id ?? meta.match_id ?? null,
    meta,
    summary: {
      strengths_count: Array.isArray(review?.strengths) ? review.strengths.length : 0,
      mistakes_count: Array.isArray(review?.mistakes) ? review.mistakes.length : 0,
      next_focus: typeof review?.next_focus === "string" ? review.next_focus : null,
      confidence: typeof review?.confidence === "number" ? review.confidence : null,
    },
  };
}

async function apiAccounts(env: Env): Promise<Response> {
  const registry = await listAccounts(env.DATA);
  // Les comptes sont indépendants : lectures KV en parallèle plutôt qu'en série.
  const out = await Promise.all(registry.map(async (account) => {
    const [games, reviews] = await Promise.all([
      readGames(env.DATA, account.slug, 1, 1),
      readJsonl<{ ts?: string; kind?: string }>(env.DATA, KEYS.reviews(account.slug)),
    ]);
    const latestGlobalReview = [...reviews].reverse().find((review) => review.kind !== "game");
    return {
      slug: account.slug,
      riot_id: account.riot_id,
      region: account.region,
      games_count: games.total,
      last_review_ts: latestGlobalReview?.ts ?? null,
    };
  }));
  return Response.json(out);
}

async function apiGames(env: Env, slug: string, params: URLSearchParams): Promise<Response> {
  const paging = pageParams(params, GAMES_MAX_SIZE);
  if (!paging) return pagingError(GAMES_MAX_SIZE);
  return Response.json(await readGames(env.DATA, slug, paging.page, paging.size));
}

async function apiReviews(env: Env, slug: string, params: URLSearchParams): Promise<Response> {
  const kind = params.get("kind");
  const reviews = await readJsonl<StoredReview>(env.DATA, KEYS.reviews(slug));
  // Compatibilité de l'API V1 pour les clients qui ne demandent pas une vue paginée.
  if (kind === null) return Response.json(reviews);
  if (kind !== "aggregate" && kind !== "game") {
    return unprocessable("kind doit être aggregate ou game");
  }
  const paging = pageParams(params);
  if (!paging) return pagingError();
  const filtered = reviews
    .filter((review) => kind === "game" ? review.kind === "game" : review.kind !== "game")
    .reverse();
  const page = paginate(filtered, paging);
  return Response.json({
    ...page,
    items: kind === "game" ? page.items.map(gameReviewSummary) : page.items,
  });
}

async function apiReviewDetail(env: Env, slug: string, ts: string): Promise<Response> {
  const reviews = await readJsonl<StoredReview>(env.DATA, KEYS.reviews(slug));
  const review = reviews.find((item) => item.ts === ts && item.kind === "game");
  return review ? Response.json(review) : notFound("analyse de partie introuvable");
}

// Table de routage /api/c/{slug}/{tail} : remplace une chaîne de 6 comparaisons.
const ACCOUNT_ROUTES: Record<
  string,
  (env: Env, slug: string, params: URLSearchParams) => Promise<Response>
> = {
  games: (env, slug, params) => apiGames(env, slug, params),
  rank: async (env, slug) => Response.json((await readRank(env.DATA, slug)) ?? EMPTY_RANK),
  "predicted-rank": async (env, slug) =>
    Response.json((await readPred(env.DATA, slug)) ?? EMPTY_PRED),
  reviews: (env, slug, params) => apiReviews(env, slug, params),
  feedback: async (env, slug) => Response.json(await readJsonl(env.DATA, KEYS.feedback(slug))),
  shap: async (env, slug) => Response.json(await readShap(env.DATA, slug)),
  eval: async (env, slug) => Response.json(await readEval(env.DATA, slug)),
  "coaching-context": async (env, slug) =>
    Response.json(await buildCoachingContext(env.DATA, slug)),
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return Response.json({
      status: "ok",
      service: "coaching-lol",
      server_time: new Date().toISOString(),
    });
  }
  if (url.pathname === "/api/accounts" && request.method === "GET") {
    return apiAccounts(env);
  }
  const reviewDetail = url.pathname.match(/^\/api\/c\/([^/]+)\/reviews\/([^/]+)$/);
  if (reviewDetail) {
    if (request.method !== "GET") return methodNotAllowed();
    return apiReviewDetail(env, reviewDetail[1], decodeURIComponent(reviewDetail[2]));
  }
  const match = url.pathname.match(/^\/api\/c\/([^/]+)\/([a-z-]+)$/);
  if (match) {
    const [, slug, tail] = match;
    if (request.method !== "GET") return methodNotAllowed();
    const route = ACCOUNT_ROUTES[tail];
    if (route) return route(env, slug, url.searchParams);
  }
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return apiLogin(request, env);
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return apiLogout(request);
  }
  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    return apiAuthStatus(request, env);
  }
  if (url.pathname === "/api/coach" && request.method === "POST") {
    if (!await isAuthorized(request, env)) {
      return unauthorized("Non autorisé : authentification requise pour générer un coaching");
    }
    return gatedCoach(request, env, apiCoach);
  }
  if (url.pathname === "/api/coach/game" && request.method === "POST") {
    if (!await isAuthorized(request, env)) {
      return unauthorized("Non autorisé : authentification requise pour analyser une partie");
    }
    return gatedCoach(request, env, apiGameCoach);
  }
  if (url.pathname === "/api/chat" && request.method === "POST") {
    if (!await isAuthorized(request, env)) {
      return unauthorized("Non autorisé : authentification requise pour utiliser le chat");
    }
    return apiChat(request, env);
  }
  if (url.pathname === "/api/feedback" && request.method === "POST") {
    return apiFeedback(request, env);
  }
  if (url.pathname.startsWith("/api/")) return notFound();
  return env.ASSETS.fetch(request);
}
