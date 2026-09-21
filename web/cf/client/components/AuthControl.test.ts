// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_KEY, setStoredAuthToken } from "../auth";
import AuthControl from "./AuthControl.ce.vue";

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    } satisfies Storage,
  });
  setStoredAuthToken(null);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe("AuthControl", () => {
  it("valide le jeton mémorisé auprès du Worker", async () => {
    setStoredAuthToken("signed-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ configured: true, authenticated: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    wrapper = mount(AuthControl);
    await flushPromises();

    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/status");
    expect(new Headers(requestOptions.headers).get("Authorization")).toBe("Bearer signed-token");
    expect(wrapper.text()).toContain("Coach active");
  });

  it("oublie un jeton refusé et propose la connexion", async () => {
    setStoredAuthToken("expired-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ configured: true, authenticated: false }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    wrapper = mount(AuthControl);
    await flushPromises();

    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(wrapper.text()).toContain("Coach sign-in");
  });

  it("ouvre le dialogue puis sait déconnecter la session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ configured: true, authenticated: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const openEvents: Event[] = [];
    window.addEventListener("coach-open-auth", (event) => openEvents.push(event), { once: true });
    wrapper = mount(AuthControl);
    await flushPromises();

    await wrapper.get(".topbar-auth-btn").trigger("click");
    expect(openEvents).toHaveLength(1);

    setStoredAuthToken("signed-token");
    window.dispatchEvent(new CustomEvent("coach-auth-change", {
      detail: { authenticated: true },
    }));
    await wrapper.vm.$nextTick();
    await wrapper.get(".topbar-logout-btn").trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/logout", { method: "POST" });
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(wrapper.text()).toContain("Coach sign-in");
  });
});
