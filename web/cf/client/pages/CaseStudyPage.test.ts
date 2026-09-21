// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CaseStudyPage from "./CaseStudyPage.vue";

const pushMock = vi.fn();
const scrollToMock = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CaseStudyPage", () => {
  window.scrollTo = scrollToMock;

  it("affiche le titre principal et le badge d'étude de cas", () => {
    const wrapper = mount(CaseStudyPage);
    expect(wrapper.text()).toContain("TECHNICAL CASE STUDY");
    expect(wrapper.text()).toContain("RiftSense: an end-to-end predictive esports coaching system");
  });

  it("affiche la bande de métriques clés chiffrées", () => {
    const wrapper = mount(CaseStudyPage);
    expect(wrapper.text()).toContain("47 701");
    expect(wrapper.text()).toContain("0.677 AUC");
    expect(wrapper.text()).toContain("100%");
    expect(wrapper.text()).toContain("< 50 ms");
  });

  it("décrit les 5 sections d'ingénierie et de data science", () => {
    const wrapper = mount(CaseStudyPage);
    expect(wrapper.text()).toContain("01 · PRODUCT CONTEXT");
    expect(wrapper.text()).toContain("02 · DATA ENGINEERING");
    expect(wrapper.text()).toContain("03 · MACHINE LEARNING");
    expect(wrapper.text()).toContain("04 · GROUNDED LLM GENERATION");
    expect(wrapper.text()).toContain("05 · STACK & TOOLS");
  });

  it("navigue vers le profil de démonstration Spadzze au clic sur le bouton d'action", async () => {
    const wrapper = mount(CaseStudyPage);
    const demoBtn = wrapper.find(".cs-btn-primary");
    expect(demoBtn.exists()).toBe(true);

    await demoBtn.trigger("click");
    expect(pushMock).toHaveBeenCalledWith("/c/spadzze");
  });

  it("navigue vers la documentation méthodologique au clic sur le bouton secondaire", async () => {
    const wrapper = mount(CaseStudyPage);
    const readmeBtn = wrapper.find(".cs-btn-secondary");
    expect(readmeBtn.exists()).toBe(true);

    await readmeBtn.trigger("click");
    expect(pushMock).toHaveBeenCalledWith("/readme");
  });

  it("affiche le lien vers le dépôt GitHub du projet", () => {
    const wrapper = mount(CaseStudyPage);
    const ghLink = wrapper.find('a[href="https://github.com/JeanVG23/riftsense"]');
    expect(ghLink.exists()).toBe(true);
    expect(ghLink.text()).toContain("Source code on GitHub");
  });
});
