// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterForm from "./RegisterForm.ce.vue";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("RegisterForm", () => {
  it("envoie le Riot ID puis ouvre la route de suivi", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ slug: "player-euw" }),
      { status: 202, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const paths: string[] = [];
    window.addEventListener("coach-go", ((event: CustomEvent<{ path: string }>) => {
      paths.push(event.detail.path);
    }) as EventListener, { once: true });

    const wrapper = mount(RegisterForm);
    await wrapper.get("#riot-id").setValue("Player#EUW");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ riot_id: "Player#EUW", platform: "euw1" }),
    }));
    expect(paths).toEqual(["/register/player-euw"]);
  });

  it("traduit un code d'erreur stable du service", async () => {
    window.history.replaceState({}, "", "/register/player-euw");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ state: "error", error_code: "riot_id_not_found" }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const wrapper = mount(RegisterForm, { props: { mode: "status" } });
    await flushPromises();

    expect(wrapper.text()).toContain("Ce Riot ID est introuvable");
    expect(wrapper.text()).toContain("Revenir au formulaire");
  });

  it("arrête le sondage au démontage", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/register/player-euw");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ state: "queued" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(RegisterForm, { props: { mode: "status" } });
    await flushPromises();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(6000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applique les attributs de scope CSS sur le template", () => {
    const wrapper = mount(RegisterForm);
    const root = wrapper.get(".register-hero-widget");
    const scopeAttr = Object.keys(root.attributes()).find((attr) => attr.startsWith("data-v-"));
    expect(scopeAttr).toBeDefined();
  });
});
