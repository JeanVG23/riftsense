// @vitest-environment jsdom
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import CoachingControls from "./CoachingControls.ce.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe("CoachingControls", () => {
  it("retire la mesure de qualité de la navigation coaching", () => {
    wrapper = mount(CoachingControls);

    expect(wrapper.text()).not.toContain("MEASURED QUALITY");
    expect(wrapper.text()).not.toContain("rated analyses");
    expect(wrapper.find(".eval-strip").exists()).toBe(false);
    const attrs = wrapper.element.attributes;
    expect(Object.keys(attrs).some(k => attrs[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("affiche le rôle principal partagé avec le SHAP sans sélecteur", async () => {
    wrapper = mount(CoachingControls, {
      props: {
        mainRoleName: "ADC",
        roleReady: true,
        authenticated: true,
        gameReviewsCount: 12,
      },
    });

    await wrapper.get(".coach-generate").trigger("click");
    await wrapper.findAll(".coach-view-tabs button")[1].trigger("click");

    expect(wrapper.emitted("generate")).toHaveLength(1);
    expect(wrapper.emitted("view-change")?.[0]).toEqual(["games"]);
    expect(wrapper.text()).toContain("Main role detected");
    expect(wrapper.text()).toContain("ADC");
    expect(wrapper.find(".segmented-choice").exists()).toBe(false);
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("Overview and recurring habits");
    expect(wrapper.text()).toContain("Detailed reviews, game by game");
  });

  it("bloque la génération tant que le rôle principal manque", () => {
    wrapper = mount(CoachingControls);
    expect(wrapper.get(".coach-generate").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Refresh required");
  });
});
