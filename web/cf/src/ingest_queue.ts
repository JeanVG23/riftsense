/** File d'ingestion : une instance unique, nommée globalement.
 *
 * `CoachGate` est nommé par joueur parce qu'il sérialise les générations d'UN
 * joueur. Ici c'est l'inverse : la limite de débit Riot est par clé
 * d'application, donc la sérialisation doit être globale, tous joueurs confondus.
 *
 * Le statut vit dans le stockage du Durable Object et jamais dans KV : un état
 * qui change toutes les secondes n'a rien à faire dans un stockage à cohérence
 * finale.
 */
import { callIngest } from "./ingest_client";
import type { Env } from "./index";

export type JobState = "queued" | "running" | "done" | "error";

export interface QueueEntry {
  slug: string;
  riot_id: string;
  platform: string;
  requested_at: number;
}

export interface JobStatus {
  state: JobState;
  position?: number;
  n_games?: number;
  error_code?: string;
  updated_at: number;
}

const QUEUE_KEY = "queue";
const jobKey = (slug: string) => `job:${slug}`;

export class IngestQueue {
  constructor(private state: DurableObjectState, private env: Env) {}

  private async queue(): Promise<QueueEntry[]> {
    return (await this.state.storage.get<QueueEntry[]>(QUEUE_KEY)) ?? [];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/enqueue" && request.method === "POST") {
      const entry = await request.json() as Omit<QueueEntry, "requested_at">;
      return Response.json(await this.enqueue(entry));
    }
    if (url.pathname === "/status") {
      const slug = url.searchParams.get("slug") ?? "";
      const status = await this.statusOf(slug);
      return status
        ? Response.json(status)
        : Response.json({ detail: "inscription inconnue" }, { status: 404 });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  }

  private async enqueue(entry: Omit<QueueEntry, "requested_at">): Promise<JobStatus> {
    const queue = await this.queue();
    let position = queue.findIndex((item) => item.slug === entry.slug) + 1;
    if (position === 0) {
      queue.push({ ...entry, requested_at: Date.now() });
      position = queue.length;
      await this.state.storage.put(QUEUE_KEY, queue);
    }
    const status: JobStatus = { state: "queued", position, updated_at: Date.now() };
    await this.state.storage.put(jobKey(entry.slug), status);
    // Une alarme immédiate : le dépilement se fait hors de la requête HTTP,
    // ce qui rend la réponse au visiteur instantanée.
    await this.state.storage.setAlarm(Date.now());
    return status;
  }

  private async statusOf(slug: string): Promise<JobStatus | null> {
    const status = await this.state.storage.get<JobStatus>(jobKey(slug));
    if (!status) return null;
    if (status.state !== "queued") return status;
    const queue = await this.queue();
    const position = queue.findIndex((item) => item.slug === slug) + 1;
    return { ...status, position: position || 1 };
  }

  async alarm(): Promise<void> {
    const queue = await this.queue();
    const entry = queue[0];
    if (!entry) return;

    await this.state.storage.put(jobKey(entry.slug), {
      state: "running", updated_at: Date.now(),
    } satisfies JobStatus);

    const result = await callIngest(this.env, {
      slug: entry.slug, riot_id: entry.riot_id, platform: entry.platform,
    });

    const done: JobStatus = result.status === "ok"
      ? { state: "done", n_games: result.n_games ?? 0, updated_at: Date.now() }
      : { state: "error", error_code: result.error_code ?? "internal",
          updated_at: Date.now() };
    await this.state.storage.put(jobKey(entry.slug), done);

    const rest = (await this.queue()).slice(1);
    await this.state.storage.put(QUEUE_KEY, rest);
    if (rest.length) await this.state.storage.setAlarm(Date.now());
  }
}
