// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_KEY, openCoachAuth, setStoredAuthToken } from "../auth";
import AuthModal from "./AuthModal.ce.vue";

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AuthModal", () => {
  it("s'ouvre à la demande et place le focus dans le mot de passe", async () => {
    wrapper = mount(AuthModal, { attachTo: document.body });

    openCoachAuth();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get("#coach-auth-password-input").element);
  });

  it("mémorise le jeton, publie le nouvel état puis reprend l'action", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, token: "signed-token" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const pendingAction = vi.fn();
    const authStates: boolean[] = [];
    window.addEventListener("coach-auth-change", ((event: CustomEvent<{ authenticated: boolean }>) => {
      authStates.push(event.detail.authenticated);
    }) as EventListener, { once: true });
    wrapper = mount(AuthModal);

    openCoachAuth(pendingAction);
    await wrapper.vm.$nextTick();
    await wrapper.get("#coach-auth-password-input").setValue(" secret ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ password: "secret" }),
    }));
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-token");
    expect(authStates).toEqual([true]);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(pendingAction).toHaveBeenCalledOnce();
  });

  it("affiche l'erreur du service sans fermer le dialogue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: "Mot de passe incorrect." }),
      { status: 401, headers: { "content-type": "application/json" } },
    )));
    wrapper = mount(AuthModal);

    openCoachAuth();
    await wrapper.vm.$nextTick();
    await wrapper.get("#coach-auth-password-input").setValue("bad-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Mot de passe incorrect.");
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("se ferme avec Échap", async () => {
    wrapper = mount(AuthModal);
    openCoachAuth();
    await wrapper.vm.$nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});
