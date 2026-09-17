// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import JobBanner from "./JobBanner.ce.vue";

describe("JobBanner", () => {
  it("reste vide sans génération active", () => {
    const wrapper = mount(JobBanner);
    expect(wrapper.find(".job-banner").exists()).toBe(false);
  });

  it("décrit la progression puis l'erreur de façon accessible", async () => {
    const wrapper = mount(JobBanner, {
      props: { job: { type: "game-coach", status: "running", progress: "génération LLM…" } },
    });
    expect(wrapper.text()).toContain("Analyse de partie en cours… génération LLM…");
    expect(wrapper.get("[aria-live=polite]").attributes("aria-live")).toBe("polite");

    await wrapper.setProps({
      job: { type: "game-coach", status: "error", error: "Service indisponible" },
    });
    expect(wrapper.get(".job-banner").classes()).toContain("err");
    expect(wrapper.text()).toContain("Service indisponible");
  });
});
