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
  /** Secondes restantes avant que le slug redevienne empilable. Présent
   * UNIQUEMENT sur un refus, jamais stocké : c'est une propriété de l'instant de
   * la réponse, pas de l'état du job. */
  retry_after?: number;
}

const QUEUE_KEY = "queue";
const JOB_PREFIX = "job:";
const jobKey = (slug: string) => `${JOB_PREFIX}${slug}`;

/** Délai avant qu'un slug dont la dernière tentative a ÉCHOUÉ redevienne
 * empilable.
 *
 * L'anti-doublon de `register.ts` s'appuie sur `last_ingest_ts`, qui n'existe
 * que sur le chemin de succès : une inscription en échec ne créait aucun compte
 * et redevenait empilable dès que le job passait de `running` à `error`. Le trou
 * était exactement là où le martelage est gratuit, chaque tentative coûtant au
 * moins un appel Riot.
 *
 * Cinq minutes, pas six heures : une panne Riot passagère ou un tag mal tapé se
 * corrige tout de suite, et une fenêtre longue punirait le visiteur de bonne foi
 * bien plus que le marteleur. */
export const RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;

/** Âge au-delà duquel un statut `job:{slug}` est supprimé au passage de l'alarme.
 *
 * La file se vidait, le journal des jobs non : c'est le vecteur de saturation
 * durable de l'instance unique. Vingt-quatre heures, largement au-dessus de
 * `RETRY_AFTER_ERROR_MS` (une purge plus courte rouvrirait la porte au
 * martelage) et au-dessus de la durée de vie d'un onglet en attente, dont le
 * sondage retomberait sinon sur un 404. */
export const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/** Délai avant qu'un slug DÉJÀ collecté avec succès redevienne empilable.
 *
 * C'est le plafond du bouton « Actualiser » du tableau de bord. Une collecte
 * coûte une quarantaine d'appels Riot (rang, liste des matchs, puis match +
 * timeline pour chacune des 20 parties) : sans plafond, un visiteur qui garde le
 * doigt sur le bouton dépense la clé de l'application, pas la sienne.
 *
 * Le refus vit ICI et pas seulement dans `register.ts` pour deux raisons. Le
 * stockage du Durable Object est fortement cohérent, alors que la garde amont
 * lit `last_ingest_ts` dans KV, à cohérence finale : deux clics séparés de
 * quelques secondes peuvent y lire le compte d'AVANT la collecte. Et
 * `last_ingest_ts` est écrit par le service sans fuseau
 * (`datetime.now().isoformat()`), donc interprété en heure locale du Worker :
 * un conteneur qui ne tournerait pas en UTC décalerait la fenêtre amont, jamais
 * celle-ci, qui ne compare que des horloges du même Durable Object. */
export const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/** Secondes restantes d'une fenêtre ouverte à `since`, au moins 1. */
export function retryAfter(since: number, window: number): number {
  return Math.max(1, Math.ceil((window - (Date.now() - since)) / 1000));
}

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
    const current = await this.state.storage.get<JobStatus>(jobKey(entry.slug));
    if (current?.state === "running") {
      // La tête en cours de traitement n'est déjà plus dans la file (retirée au
      // début de `alarm()`) : sans ce garde-fou, une seconde requête pendant le
      // `callIngest` en cours la repousserait en file ET ferait régresser son
      // statut de "running" à "queued", visible du visiteur qui recharge la page.
      return current;
    }
    if (current?.state === "done"
        && Date.now() - current.updated_at < REFRESH_COOLDOWN_MS) {
      // Le job précédent a réussi il y a moins de quinze minutes : les parties
      // qu'une nouvelle collecte ramènerait sont déjà là. `retry_after` dit à
      // l'appelant que c'est un refus et non une mise en file.
      return { ...current, retry_after: retryAfter(current.updated_at, REFRESH_COOLDOWN_MS) };
    }
    if (current?.state === "error"
        && Date.now() - current.updated_at < RETRY_AFTER_ERROR_MS) {
      // Même corps qu'un statut ordinaire : le visiteur revoit son code d'erreur,
      // le service n'est pas rappelé, et aucun cinquième code n'apparaît.
      return current;
    }
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

  /** Supprime les statuts de job périmés. Appelée au passage de l'alarme, donc
   * amortie sur le trafic d'inscription : pas de tâche de fond à surveiller. */
  private async purgeStaleJobs(): Promise<void> {
    const jobs = await this.state.storage.list<JobStatus>({ prefix: JOB_PREFIX });
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [key, status] of jobs) {
      if (typeof status?.updated_at === "number" && status.updated_at < cutoff) {
        await this.state.storage.delete(key);
      }
    }
  }

  async alarm(): Promise<void> {
    await this.purgeStaleJobs();
    const queue = await this.queue();
    const entry = queue[0];
    if (!entry) return;

    await this.state.storage.put(jobKey(entry.slug), {
      state: "running", updated_at: Date.now(),
    } satisfies JobStatus);

    let done: JobStatus;
    try {
      const result = await callIngest(this.env, {
        slug: entry.slug, riot_id: entry.riot_id, platform: entry.platform,
      });
      done = result.status === "ok"
        ? { state: "done", n_games: result.n_games ?? 0, updated_at: Date.now() }
        : { state: "error", error_code: result.error_code ?? "internal",
            updated_at: Date.now() };
    } catch {
      // `callIngest` enveloppe déjà `fetch`/`json()` dans des `catch` et ne
      // devrait jamais lever, mais si un échec imprévu survenait ici, la tête
      // doit quand même être retirée : sinon elle reste "running" pour
      // toujours et bloque toute la file globale, tous joueurs confondus.
      done = { state: "error", error_code: "internal", updated_at: Date.now() };
    }
    await this.state.storage.put(jobKey(entry.slug), done);

    // Retrait par slug, pas par index : robuste si la file venait un jour à
    // être réordonnée.
    const rest = (await this.queue()).filter((item) => item.slug !== entry.slug);
    await this.state.storage.put(QUEUE_KEY, rest);
    if (rest.length) await this.state.storage.setAlarm(Date.now());
  }
}
