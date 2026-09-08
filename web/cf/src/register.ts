/** Inscription d'un joueur : validation, slug, anti-doublon, routes HTTP.
 *
 * Le slug est calculé ICI et nulle part ailleurs : le service Python le reçoit
 * tel quel. Deux implémentations de la même normalisation dans deux runtimes
 * seraient un contrat de parité de plus, pour aucun gain.
 */
import { readAccount, type Account } from "./accounts";
import { jsonError, notFound, unprocessable } from "./http";
import type { Env } from "./index";

/** Miroir des clés de `PLATFORM_TO_REGIONAL` (src/core/riotlib.py).
 * Verrouillé par tests/test_platform_parity.py : proposer au visiteur une
 * plateforme que le service ne sait pas router produirait une erreur `internal`
 * une minute après l'inscription, au lieu d'un refus immédiat. */
export const PLATFORMS = [
  "euw1", "eun1", "tr1", "ru", "me1",
  "na1", "br1", "la1", "la2",
  "kr", "jp1",
  "oc1", "ph2", "sg2", "th2", "tw2", "vn2",
] as const;

/** Une inscription du même slug dans cette fenêtre rend les données existantes
 * sans rien collecter : c'est ce qui protège la clé Riot du visiteur qui
 * rafraîchit sa page. */
export const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

export function parseRiotId(value: string): { gameName: string; tagLine: string } | null {
  const parts = value.trim().split("#");
  if (parts.length !== 2) return null;
  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();
  if (!gameName || !tagLine) return null;
  if (gameName.length > 32 || !/^[A-Za-z0-9]{2,5}$/.test(tagLine)) return null;
  return { gameName, tagLine };
}

/** Hash FNV-1a, synchrone et pur : le slug se calcule uniquement côté
 * TypeScript, sans `crypto.subtle` ni `await`. Sert de repli quand un segment
 * ne contient aucun caractère ASCII alphanumérique (pseudo coréen, cyrillique,
 * purement ponctuation…) : sans ce repli, tous ces pseudos normaliseraient
 * vers le même segment vide et se disputeraient le même slug. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function slugFor(gameName: string, tagLine: string): string {
  const normalize = (s: string) =>
    s.normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const segment = (raw: string) => normalize(raw) || `p${fnv1a(raw)}`;
  return `${segment(gameName)}-${segment(tagLine)}`;
}

function queueStub(env: Env) {
  // Une seule instance, nommée globalement : la sérialisation est globale parce
  // que la limite de débit Riot l'est.
  return env.INGEST_QUEUE!.get(env.INGEST_QUEUE!.idFromName("global"));
}

export async function apiRegister(request: Request, env: Env): Promise<Response> {
  if (!env.INGEST_QUEUE) return jsonError(503, "inscription indisponible");
  const body = await request.json().catch(() => null) as
    { riot_id?: unknown; platform?: unknown } | null;
  if (typeof body?.riot_id !== "string" || typeof body?.platform !== "string") {
    return unprocessable("riot_id et platform sont requis");
  }
  const platform = body.platform.toLowerCase();
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    return unprocessable("plateforme inconnue");
  }
  const parsed = parseRiotId(body.riot_id);
  if (!parsed) return unprocessable("Riot ID attendu sous la forme Pseudo#TAG");
  // Espaces internes réduits à un seul : "Le  Petit  Chat" et "Le Petit Chat"
  // sont le même Riot ID, sans quoi le même joueur obtiendrait un faux 409.
  const gameName = parsed.gameName.replace(/\s+/g, " ");

  const riotId = `${gameName}#${parsed.tagLine}`;
  const slug = slugFor(gameName, parsed.tagLine);

  const existing: Account | null = await readAccount(env.DATA, slug);
  if (existing && existing.riot_id.toLowerCase() !== riotId.toLowerCase()) {
    return jsonError(409, "ce slug est déjà pris par un autre compte");
  }
  const last = existing?.last_ingest_ts ? Date.parse(existing.last_ingest_ts) : NaN;
  if (Number.isFinite(last) && Date.now() - last < FRESH_WINDOW_MS) {
    return Response.json({ slug, state: "done", fresh: true,
                           status_url: `/api/register/${slug}/status` });
  }

  const queued = await queueStub(env).fetch(new Request("http://do/enqueue", {
    method: "POST",
    body: JSON.stringify({ slug, riot_id: riotId, platform }),
  }));
  const status = await queued.json();
  return Response.json({ slug, status_url: `/api/register/${slug}/status`, ...status as object },
                       { status: 202 });
}

export async function apiRegisterStatus(env: Env, slug: string): Promise<Response> {
  if (!env.INGEST_QUEUE) return jsonError(503, "inscription indisponible");
  const response = await queueStub(env)
    .fetch(new Request(`http://do/status?slug=${encodeURIComponent(slug)}`));
  if (response.status === 404) {
    // Un job expiré mais un compte présent : l'inscription a bien abouti.
    const account = await readAccount(env.DATA, slug);
    return account
      ? Response.json({ state: "done", slug })
      : notFound("inscription inconnue");
  }
  return response;
}
