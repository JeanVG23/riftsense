import { describe, expect, it } from "vitest";
import { CoachGate } from "../src/coach_gate";
import type { Env } from "../src/index";
import type { KVLike } from "../src/readers";

class MemoryKV implements KVLike {
  async get() { return null; }
  async put() {}
}

describe("CoachGate", () => {
  it("refuse une seconde génération et libère le verrou à la fin du body", async () => {
    const env = {
      DATA: new MemoryKV(), ASSETS: { fetch: async () => new Response("spa") },
    } as unknown as Env;
    const lock = new Map<string, unknown>();
    const state = {
      storage: {
        get: async (key: string) => lock.get(key),
        put: async (key: string, value: unknown) => { lock.set(key, value); },
        delete: async (key: string) => lock.delete(key),
        setAlarm: async (value: number) => { lock.set("alarm", value); },
        deleteAlarm: async () => lock.delete("alarm"),
      },
      waitUntil: (promise: Promise<unknown>) => { void promise; },
    } as unknown as DurableObjectState;
    const gate = new CoachGate(state, env);
    const request = () => new Request("http://x/api/coach", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "inconnu" }),
    });

    const first = await gate.fetch(request());
    const concurrent = await gate.fetch(request());
    expect(concurrent.status).toBe(409);
    expect(await concurrent.json()).toEqual({ detail: "an analysis is already in progress" });
    await first.text();
    const after = await gate.fetch(request());
    expect(after.status).toBe(404);
    await after.text();
  });

  it("ignore un ancien verrou 30 minutes devenu obsolète", async () => {
    const env = {
      DATA: new MemoryKV(), ASSETS: { fetch: async () => new Response("spa") },
    } as unknown as Env;
    const lock = new Map<string, unknown>([["active_until", Date.now() + 25 * 60_000]]);
    const state = {
      storage: {
        get: async (key: string) => lock.get(key),
        put: async (key: string, value: unknown) => { lock.set(key, value); },
        delete: async (key: string) => lock.delete(key),
        setAlarm: async (value: number) => { lock.set("alarm", value); },
        deleteAlarm: async () => lock.delete("alarm"),
      },
    } as unknown as DurableObjectState;
    const gate = new CoachGate(state, env);
    const response = await gate.fetch(new Request("http://x/api/coach", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "inconnu" }),
    }));
    expect(response.status).toBe(404);
    await response.text();
  });
});
