// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { router } from "../router";
import TermsPage from "./TermsPage.vue";
import PrivacyPage from "./PrivacyPage.vue";

describe("TermsPage", () => {
  it("affiche le titre et la citation légale Riot Games", () => {
    const wrapper = mount(TermsPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Conditions Générales d'Utilisation");
    expect(wrapper.text()).toContain("RiftSense isn't endorsed by Riot Games");
    expect(wrapper.text()).toContain("Zero Real-Time Gameplay Assistance");
  });

  it("détaille les sections clés de conformité Riot et contact", () => {
    const wrapper = mount(TermsPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Conformité aux politiques Riot Games");
    expect(wrapper.text()).toContain("contact@jeanvg.fr");
    expect(wrapper.findAll("section.legal-card").length).toBeGreaterThanOrEqual(6);
  });
});

describe("PrivacyPage", () => {
  it("affiche le titre et l'engagement de protection des données", () => {
    const wrapper = mount(PrivacyPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("Politique de Confidentialité");
    expect(wrapper.text()).toContain("RGPD");
    expect(wrapper.text()).toContain("Aucun mot de passe");
  });

  it("explique les données collectées et le droit à l'effacement", () => {
    const wrapper = mount(PrivacyPage, {
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain("PUUID");
    expect(wrapper.text()).toContain("Droit à l'effacement");
    expect(wrapper.text()).toContain("contact@jeanvg.fr");
    expect(wrapper.findAll("section.legal-card").length).toBeGreaterThanOrEqual(6);
  });
});
