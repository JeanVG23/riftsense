import { describe, expect, it, vi, afterEach } from "vitest";
import { IngestQueue, JOB_TTL_MS, RETRY_AFTER_ERROR_MS } from "../src/ingest_queue";

function fakeState() {
  const storage = new Map<string, unknown>();
  const alarms: number[] = [];
  return {
    alarms,
    storage: {
      get: async <T>(key: string) => storage.get(key) as T | undefined,
      put: async (key: string, value: unknown) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
      list: async <T>({ prefix = "" } = {}) => new Map(
        [...storage.entries()].filter(([key]) => key.startsWith(prefix)),
      ) as Map<string, T>,
      setAlarm: async (at: number) => { alarms.push(at); },
    },
    blockConcurrencyWhile: async (fn: () => Promise<void>) => fn(),
  } as unknown as DurableObjectState & { alarms: number[] };
}

const ENV = { INGEST_URL: "https://ingest.example", INGEST_SECRET: "s" } as never;

const enqueue = (queue: IngestQueue, slug: string) =>
  queue.fetch(new Request("http://do/enqueue", {
    method: "POST",
    body: JSON.stringify({ slug, riot_id: `${slug}#euw`, platform: "euw1" }),
  }));

const status = (queue: IngestQueue, slug: string) =>
  queue.fetch(new Request(`http://do/status?slug=${slug}`));

afterEach(() => { vi.unstubAllGlobals(); });

describe("IngestQueue", () => {
  it("met en file et rend la position", async () => {
    const queue = new IngestQueue(fakeState(), ENV);
    expect(await (await enqueue(queue, "a")).json())
      .toMatchObject({ state: "queued", position: 1 });
    expect(await (await enqueue(queue, "b")).json())
      .toMatchObject({ state: "queued", position: 2 });
  });

  it("ne met pas deux fois le même slug en file", async () => {
    const queue = new IngestQueue(fakeState(), ENV);
    await enqueue(queue, "a");
    expect(await (await enqueue(queue, "a")).json())
      .toMatchObject({ state: "queued", position: 1 });
  });

  it("programme une alarme dès la première mise en file", async () => {
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await enqueue(queue, "a");
    expect(state.alarms.length).toBe(1);
  });

  it("passe le job à done et publie le nombre de parties", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", n_games: 17 }), { status: 200 }));
    const queue = new IngestQueue(fakeState(), ENV);
    await enqueue(queue, "a");
    await queue.alarm();
    expect(await (await status(queue, "a")).json())
      .toMatchObject({ state: "done", n_games: 17 });
  });

  it("passe le job à error en conservant le code typé", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error_code: "riot_id_not_found" }), { status: 422 }));
    const queue = new IngestQueue(fakeState(), ENV);
    await enqueue(queue, "a");
    await queue.alarm();
    expect(await (await status(queue, "a")).json())
      .toMatchObject({ state: "error", error_code: "riot_id_not_found" });
  });

  it("enchaîne le job suivant et reprogramme une alarme", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", n_games: 1 }), { status: 200 }));
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await enqueue(queue, "a");
    await enqueue(queue, "b");
    await queue.alarm();
    expect(await (await status(queue, "a")).json()).toMatchObject({ state: "done" });
    expect(state.alarms.length).toBeGreaterThan(1);
    await queue.alarm();
    expect(await (await status(queue, "b")).json()).toMatchObject({ state: "done" });
  });

  it("rend un statut inconnu pour un slug jamais inscrit", async () => {
    const queue = new IngestQueue(fakeState(), ENV);
    expect((await status(queue, "jamais")).status).toBe(404);
  });

  it("ne régresse pas un job en cours d'exécution vers queued", async () => {
    // `callIngest` ne se résout jamais pendant ce test : la tête reste "running"
    // le temps qu'une seconde requête d'enqueue arrive sur le même slug.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
    const queue = new IngestQueue(fakeState(), ENV);
    await enqueue(queue, "a");
    void queue.alarm();
    // Laisse le temps aux micro-tâches (jusqu'à l'écriture du statut "running")
    // de se dérouler avant le `fetch` qui, lui, ne se résoudra jamais ici.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await (await status(queue, "a")).json()).toMatchObject({ state: "running" });
    await enqueue(queue, "a");
    expect(await (await status(queue, "a")).json()).toMatchObject({ state: "running" });
  });

  it("retire la tête et publie une erreur typée si le traitement lève", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("panne réseau"); });
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await enqueue(queue, "a");
    await enqueue(queue, "b");
    await queue.alarm();
    expect(await (await status(queue, "a")).json())
      .toMatchObject({ state: "error", error_code: "internal" });
    // La file n'est pas bloquée : le job suivant a bien été reprogrammé, même
    // si le traitement de la tête a levé une exception imprévue.
    expect(state.alarms.length).toBeGreaterThan(1);
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", n_games: 3 }), { status: 200 }));
    await queue.alarm();
    expect(await (await status(queue, "b")).json()).toMatchObject({ state: "done" });
  });
  it("ne ré-empile pas immédiatement un slug dont la tentative a échoué", async () => {
    // `last_ingest_ts` n'est écrit que sur le chemin de succès : une inscription
    // en échec ne laisse aucune trace côté compte, et le martelage y serait
    // gratuit alors que chaque tentative coûte au moins un appel Riot.
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error_code: "riot_id_not_found" }), { status: 422 }));
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await enqueue(queue, "a");
    await queue.alarm();
    const alarmsAfterFirst = state.alarms.length;

    const again = await (await enqueue(queue, "a")).json();
    expect(again).toMatchObject({ state: "error", error_code: "riot_id_not_found" });
    // Ni remise en file, ni nouvelle alarme : le service n'est pas rappelé.
    expect(state.alarms.length).toBe(alarmsAfterFirst);
    await queue.alarm();
    expect(await (await status(queue, "a")).json()).toMatchObject({ state: "error" });
  });

  it("ré-empile le slug une fois la fenêtre de nouvelle tentative passée", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error_code: "riot_unavailable" }), { status: 503 }));
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await enqueue(queue, "a");
    await queue.alarm();

    const stale = await state.storage.get<{ updated_at: number }>("job:a");
    await state.storage.put("job:a", { ...stale, updated_at: Date.now() - RETRY_AFTER_ERROR_MS - 1 });

    expect(await (await enqueue(queue, "a")).json()).toMatchObject({ state: "queued" });
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", n_games: 4 }), { status: 200 }));
    await queue.alarm();
    expect(await (await status(queue, "a")).json()).toMatchObject({ state: "done", n_games: 4 });
  });

  it("purge les statuts de job périmés au passage de l'alarme", async () => {
    // La file se vide, le journal des jobs non : c'est le vecteur de saturation
    // durable de l'instance unique, qui est globale.
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", n_games: 1 }), { status: 200 }));
    const state = fakeState();
    const queue = new IngestQueue(state, ENV);
    await state.storage.put("job:ancien", {
      state: "done", n_games: 2, updated_at: Date.now() - JOB_TTL_MS - 1,
    });
    await enqueue(queue, "recent");
    await queue.alarm();

    expect((await status(queue, "ancien")).status).toBe(404);
    // Le job frais, lui, survit : la purge est fondée sur l'âge, pas sur l'état.
    expect(await (await status(queue, "recent")).json()).toMatchObject({ state: "done" });
  });
});
