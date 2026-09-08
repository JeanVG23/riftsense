import { afterEach, describe, expect, it, vi } from "vitest";
import { callIngest } from "../src/ingest_client";

const ENV = { INGEST_URL: "https://ingest.example", INGEST_SECRET: "s3cr3t" };
const BODY = { slug: "spadzze-euw", riot_id: "Spadzze#euw", platform: "euw1" };

afterEach(() => { vi.unstubAllGlobals(); });

describe("callIngest", () => {
  it("poste le corps avec le secret en en-tête et rend le résultat", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return new Response(JSON.stringify({ status: "ok", n_games: 18 }), { status: 200 });
    });
    const result = await callIngest(ENV, BODY);
    expect(seen.url).toBe("https://ingest.example/ingest");
    expect((seen.init?.headers as Record<string, string>)["X-Ingest-Secret"]).toBe("s3cr3t");
    expect(JSON.parse(seen.init?.body as string)).toEqual(BODY);
    expect(result).toEqual({ status: "ok", n_games: 18 });
  });

  it("remonte le code d'erreur typé du service", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error_code: "riot_id_not_found" }), { status: 422 }));
    expect(await callIngest(ENV, BODY))
      .toEqual({ status: "error", error_code: "riot_id_not_found" });
  });

  it("rend internal quand le service est injoignable", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("network"); });
    expect(await callIngest(ENV, BODY)).toEqual({ status: "error", error_code: "internal" });
  });

  it("rend internal quand la configuration manque, sans appeler le réseau", async () => {
    const called = vi.fn();
    vi.stubGlobal("fetch", called);
    expect(await callIngest({}, BODY)).toEqual({ status: "error", error_code: "internal" });
    expect(called).not.toHaveBeenCalled();
  });
});
