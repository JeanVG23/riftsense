// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DemoRecruiterBanner from "./DemoRecruiterBanner.vue";

describe("DemoRecruiterBanner", () => {
  it("affiche le badge de démonstration et la description", () => {
    const wrapper = mount(DemoRecruiterBanner, {
      props: {
        currentTab: "history",
        currentCoachingView: "overall",
      },
    });

    expect(wrapper.text()).toContain("DEMO MODE · REFERENCE PROFILE SPADZZE#EUW");
    expect(wrapper.text()).toContain("47,701 analyzed matches");
  });

  it("émet l'événement select-view lors du clic sur le bouton d'analyse de partie", async () => {
    const wrapper = mount(DemoRecruiterBanner, {
      props: {
        currentTab: "history",
        currentCoachingView: "overall",
      },
    });

    const buttons = wrapper.findAll(".demo-nav-btn");
    expect(buttons.length).toBe(3);

    // Bouton 1 : Analyse de match
    await buttons[0].trigger("click");
    expect(wrapper.emitted("select-view")).toBeTruthy();
    expect(wrapper.emitted("select-view")![0]).toEqual(["coaching", "games", "EUW1_7898084645"]);
  });

  it("émet l'événement select-view pour le profil SHAP", async () => {
    const wrapper = mount(DemoRecruiterBanner, {
      props: {
        currentTab: "history",
        currentCoachingView: "overall",
      },
    });

    const buttons = wrapper.findAll(".demo-nav-btn");
    // Bouton 2 : SHAP
    await buttons[1].trigger("click");
    expect(wrapper.emitted("select-view")![0]).toEqual(["shap"]);
  });

  it("applique la classe active sur le bouton correspondant à la vue active", () => {
    const wrapper = mount(DemoRecruiterBanner, {
      props: {
        currentTab: "coaching",
        currentCoachingView: "games",
        targetMatchId: "EUW1_7898084645",
      },
    });

    const buttons = wrapper.findAll(".demo-nav-btn");
    expect(buttons[0].classes()).toContain("active");
    expect(buttons[1].classes()).not.toContain("active");
    expect(buttons[2].classes()).not.toContain("active");
  });
});
