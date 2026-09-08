import { describe, expect, it, vi, afterEach } from "vitest";
import { IngestQueue } from "../src/ingest_queue";

function fakeState() {
  const storage = new Map<string, unknown>();
  const alarms: number[] = [];
  return {
    alarms,
    storage: {
      get: async <T>(key: string) => storage.get(key) as T | undefined,
      put: async (key: string, value: unknown) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
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
});
