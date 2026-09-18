// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NavSearch from "./NavSearch.vue";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NavSearch", () => {
  it("soumet le Riot ID et le serveur puis navigue vers le suivi d'inscription", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: "spadzze-euw", n_games: 20 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const paths: string[] = [];
    window.addEventListener("coach-go", ((event: CustomEvent<{ path: string }>) => {
      paths.push(event.detail.path);
    }) as EventListener, { once: true });

    const wrapper = mount(NavSearch);
    await wrapper.get("#nav-riot-id").setValue("Spadzze#euw");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ riot_id: "Spadzze#euw", platform: "euw1" }),
      })
    );
    expect(paths).toEqual(["/register/spadzze-euw"]);
  });

  it("alerte si le format ne contient pas de tag (#)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(NavSearch);
    await wrapper.get("#nav-riot-id").setValue("SpadzzeSansTag");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Format attendu : Invocateur#TAG");
  });

  it("permet de sélectionner un autre serveur (ex: NA)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: "doublelift-na" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = mount(NavSearch);
    await wrapper.get("#nav-riot-id").setValue("Doublelift#NA1");
    await wrapper.get("#nav-platform").setValue("na1");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ riot_id: "Doublelift#NA1", platform: "na1" }),
      })
    );
  });
});
