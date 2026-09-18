// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { router } from "./router";
import { RECENT_ACCOUNTS_KEY } from "./recent-accounts";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  localStorage.clear();
  window.scrollTo = vi.fn();
  await router.replace("/");
  vi.restoreAllMocks();
});

describe("App topbar switcher", () => {
  it("affiche l'icône et le pseudo du compte actif quand il est dans les comptes récents", async () => {
    localStorage.setItem(
      RECENT_ACCOUNTS_KEY,
      JSON.stringify([
        {
          slug: "allez-bodycount-viego",
          riot_id: "Allez Bodycount#VIEGO",
          region: "euw1",
          icon: 5780,
          level: 345,
          last_visited_at: new Date().toISOString(),
        },
      ])
    );

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/accounts") return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({}, 404));
    }) as any;

    await router.push("/c/allez-bodycount-viego");
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        stubs: {
          HomePage: true,
          RegisterForm: true,
          AccountPage: true,
          ReadmePage: true,
          TermsPage: true,
          PrivacyPage: true,
          AuthControl: true,
          AuthModal: true,
          NavSearch: true,
        },
      },
    });

    await wrapper.vm.$nextTick();

    const avatar = wrapper.find(".switcher-avatar");
    expect(avatar.exists()).toBe(true);
    expect(avatar.attributes("src")).toContain("/profileicon/5780.png");

    const name = wrapper.find(".switcher-name");
    expect(name.text()).toBe("Allez Bodycount");
  });

  it("récupère l'icône réelle via l'API pour un compte inconnu", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/accounts") return Promise.resolve(jsonResponse([]));
      if (url.includes("/api/c/nouveau-joueur/account")) {
        return Promise.resolve(
          jsonResponse({
            slug: "nouveau-joueur",
            riot_id: "Nouveau Joueur#EUW",
            region: "euw1",
            icon: 1234,
            level: 50,
          })
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    }) as any;

    await router.push("/c/nouveau-joueur");
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        stubs: {
          HomePage: true,
          RegisterForm: true,
          AccountPage: true,
          ReadmePage: true,
          TermsPage: true,
          PrivacyPage: true,
          AuthControl: true,
          AuthModal: true,
          NavSearch: true,
        },
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    await wrapper.vm.$nextTick();

    const avatar = wrapper.find(".switcher-avatar");
    expect(avatar.attributes("src")).toContain("/profileicon/1234.png");
    const name = wrapper.find(".switcher-name");
    expect(name.text()).toBe("Nouveau Joueur");
  });

  it("compile avec les styles scoped de Vue", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse([]))) as any;
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        stubs: {
          HomePage: true,
          RegisterForm: true,
          AccountPage: true,
          ReadmePage: true,
          TermsPage: true,
          PrivacyPage: true,
          AuthControl: true,
          AuthModal: true,
          NavSearch: true,
        },
      },
    });
    expect(Object.keys(wrapper.element.attributes).some(k => wrapper.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });
});
