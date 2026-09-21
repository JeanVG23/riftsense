// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { router } from "../router";
import TermsPage from "./TermsPage.vue";
import PrivacyPage from "./PrivacyPage.vue";
import ReadmePage from "./ReadmePage.vue";

describe("TermsPage", () => {
  it("affiche le titre et la citation légale Riot Games", () => {
    const wrapper = mount(TermsPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Terms of Use");
    expect(wrapper.text()).toContain("RiftSense isn't endorsed by Riot Games");
    expect(wrapper.text()).toContain("Zero Real-Time Gameplay Assistance");
    expect(Object.keys(wrapper.element.attributes).some(k => wrapper.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("détaille les sections clés de conformité Riot et contact", () => {
    const wrapper = mount(TermsPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Riot Games Policy & API Compliance");
    expect(wrapper.text()).toContain("contact@jeanvg.fr");
    expect(wrapper.findAll("section.legal-card").length).toBeGreaterThanOrEqual(6);
  });
});

describe("PrivacyPage", () => {
  it("affiche le titre et l'engagement de protection des données", () => {
    const wrapper = mount(PrivacyPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Privacy Policy");
    expect(wrapper.text()).toContain("GDPR");
    expect(wrapper.text()).toContain("No passwords");
    expect(Object.keys(wrapper.element.attributes).some(k => wrapper.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("explique les données collectées et le droit à l'effacement", () => {
    const wrapper = mount(PrivacyPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("PUUID");
    expect(wrapper.text()).toContain("Right to Erasure");
    expect(wrapper.text()).toContain("contact@jeanvg.fr");
    expect(wrapper.findAll("section.legal-card").length).toBeGreaterThanOrEqual(6);
  });
});

describe("ReadmePage", () => {
  it("affiche la documentation méthodologique et les onglets", () => {
    const wrapper = mount(ReadmePage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("How RiftSense works");
    expect(wrapper.text()).toContain("The problem with op.gg");
    expect(Object.keys(wrapper.element.attributes).some(k => wrapper.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });
});
