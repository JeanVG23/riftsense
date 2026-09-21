// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref, type Ref } from "vue";
import { useIngestSync, type IngestSync, type IngestSyncOpts } from "./ingest-sync";

/** Le composable vit dans un setup : on le monte via un Host à render
 * function (pas de template inline : le build runtime-only n'a pas de
 * compilateur, et un render () => null n'en a pas besoin). Le wrapper est
 * enregistré dans la variable du module pour qu'afterEach le démonte : sans
 * le démontage, l'horloge de cooldown et le suivi de job fuiraient d'un
 * test à l'autre. */
let wrapper: VueWrapper | null = null;

function mountSync(initialSlug: string, opts: IngestSyncOpts = {}): {
  sync: IngestSync; slug: Ref<string>;
} {
  const slug = ref(initialSlug);
  let sync!: IngestSync;
  wrapper = mount(defineComponent({
    setup() {
      sync = useIngestSync(slug, opts);
      return () => null;
    },
  }));
  return { sync, slug };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // La fenêtre de rafraîchissement est mémorisée par slug : sans ce nettoyage,
  // un test qui la pose griserait le bouton des suivants.
  localStorage.clear();
});

describe("useIngestSync", () => {
  it("poste sur le slug du compte, jamais sur un Riot ID reconstitué", async () => {
    const fetchMock = vi.fn((path: string, _init?: RequestInit) => Promise.resolve(
      path.endsWith("/refresh") ? jsonResponse({ state: "queued", cooldown: 900 }, 202) : jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze");

    sync.trigger();
    await flushPromises();

    const call = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/refresh"));
    expect(call?.[0]).toBe("/api/c/spadzze/refresh");
    expect((call?.[1] as RequestInit | undefined)?.method).toBe("POST");
    expect(fetchMock.mock.calls.some(([path]) => String(path) === "/api/register")).toBe(false);
  });

  it("grise pour la durée que le serveur annonce dans son 429, puis persiste la fenêtre", async () => {
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh") ? jsonResponse({ detail: "déjà à jour", retry_after: 900 }, 429) : jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze");

    sync.trigger();
    await flushPromises();
    const callsAfterRefusal = fetchMock.mock.calls.length;

    expect(sync.cooling).toBe(true);
    expect(sync.feedback).toBe("Data already up to date");
    expect(sync.cooldownLabel).toBe("Up to date · 15 min");
    expect(localStorage.getItem("riftsense:refresh:spadzze")).not.toBeNull();

    // Deuxième déclenchement : plus aucun appel, le refus est déjà connu.
    sync.trigger();
    await flushPromises();
    expect(fetchMock.mock.calls.length).toBe(callsAfterRefusal);
  });

  it("invoque onDone une seule fois par job réussi et pose le cooldown annoncé", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh")
        ? jsonResponse({ state: "queued", cooldown: 900 }, 202)
        : jsonResponse({ state: "done", n_games: 20 })));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze", { onDone });

    sync.trigger();
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();

    expect(sync.feedback).toBe("20 games synced");
    expect(sync.cooling).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(20);
  });

  it("traduit le code d'erreur de la file en message court, sans poser de cooldown", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh")
        ? jsonResponse({ state: "queued", cooldown: 900 }, 202)
        : jsonResponse({ state: "error", error_code: "riot_id_not_found" })));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze");

    sync.trigger();
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();

    expect(sync.feedback).toBe("Riot ID not found");
    expect(sync.cooling).toBe(false);
    expect(sync.syncing).toBe(false);
  });

  it("retrouve la fenêtre posée avant un rechargement de page", async () => {
    localStorage.setItem("riftsense:refresh:spadzze", String(Date.now() + 5 * 60 * 1000));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze");

    expect(sync.cooling).toBe(true);
    expect(sync.cooldownLabel).toBe("Up to date · 5 min");
    sync.trigger();
    await flushPromises();
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith("/refresh"))).toBe(false);
  });

  it("invalide le job en cours au changement de slug : plus aucun sondage pour l'ancien", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh")
        ? jsonResponse({ state: "queued", cooldown: 900 }, 202)
        : jsonResponse({ state: "running" })));
    vi.stubGlobal("fetch", fetchMock);
    const { sync, slug } = mountSync("spadzze");

    sync.trigger();
    await vi.advanceTimersByTimeAsync(3100);
    expect(sync.feedback).toBe("Collecting games…");

    slug.value = "autre";
    await flushPromises();
    expect(sync.feedback).toBe(null);

    const pollsForOldSlug = fetchMock.mock.calls
      .filter(([path]) => String(path) === "/api/register/spadzze/status").length;
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock.mock.calls
      .filter(([path]) => String(path) === "/api/register/spadzze/status").length).toBe(pollsForOldSlug);
  });

  it("arrête horloge et sondages au démontage", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((path: string) => Promise.resolve(
      path.endsWith("/refresh")
        ? jsonResponse({ state: "queued", cooldown: 900 }, 202)
        : jsonResponse({ state: "running" })));
    vi.stubGlobal("fetch", fetchMock);
    const { sync } = mountSync("spadzze");

    sync.trigger();
    await vi.advanceTimersByTimeAsync(3100);
    const pollsBeforeUnmount = fetchMock.mock.calls
      .filter(([path]) => String(path).endsWith("/status")).length;
    expect(pollsBeforeUnmount).toBeGreaterThan(0);

    // Démonté à la main : afterEach ne doit pas tenter un second unmount.
    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(20000);

    // La séquence d'invalidation fige le suivi : plus aucun sondage.
    expect(fetchMock.mock.calls
      .filter(([path]) => String(path).endsWith("/status")).length)
      .toBe(pollsBeforeUnmount);
  });
});
