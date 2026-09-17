/** Appel du service d'ingestion Cloud Run depuis le Worker.
 *
 * Le Worker ne connaît que l'URL du service et le secret partagé : la clé Riot
 * ne quitte jamais GCP. Toute erreur est ramenée à un code stable, jamais à un
 * texte de message.
 */
export interface IngestRequest {
  slug: string;
  riot_id: string;
  platform: string;
}

export interface IngestResult {
  status: "ok" | "error";
  n_games?: number;
  error_code?: string;
}

export interface IngestEnv {
  INGEST_URL?: string;
  INGEST_SECRET?: string;
}

export async function callIngest(env: IngestEnv, body: IngestRequest): Promise<IngestResult> {
  if (!env.INGEST_URL || !env.INGEST_SECRET) {
    return { status: "error", error_code: "internal" };
  }
  let response: Response;
  try {
    response = await fetch(`${env.INGEST_URL}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Ingest-Secret": env.INGEST_SECRET },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: "error", error_code: "internal" };
  }
  const payload = await response.json().catch(() => null) as
    { status?: unknown; n_games?: unknown; error_code?: unknown } | null;
  if (!response.ok || payload?.status !== "ok") {
    const code = typeof payload?.error_code === "string" ? payload.error_code : "internal";
    return { status: "error", error_code: code };
  }
  return {
    status: "ok",
    n_games: typeof payload.n_games === "number" ? payload.n_games : 0,
  };
}
