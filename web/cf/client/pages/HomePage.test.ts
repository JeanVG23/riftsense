// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage.vue";

const pushMock = vi.fn();
const scrollToMock = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("HomePage", () => {
  window.scrollTo = scrollToMock;
  const sampleAccounts = [
    { slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1", group: "owner", games_count: 60, last_review_ts: "2026-09-06T12:00:00Z" },
    { slug: "aceofspadzze", riot_id: "AceOfSpadzze#EQ4", region: "euw1", group: "owner", games_count: 20, last_review_ts: null },
    { slug: "vangy", riot_id: "vangy#euw", region: "euw1", group: "permanent", games_count: 20, last_review_ts: null },
    { slug: "vlintter", riot_id: "Vlintter#EUW", region: "euw1", group: "permanent", games_count: 20, last_review_ts: null },
  ];

  it("affiche le message de chargement quand loading=true", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: [], loading: true },
    });
    expect(wrapper.text()).toContain("Chargement des comptes…");
  });

  it("affiche le message d'absence de compte quand la liste est vide", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: [], loading: false },
    });
    expect(wrapper.text()).toContain("Aucun compte configuré.");
  });

  it("sépare distinctement Mes comptes et Profils de référence", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });

    expect(wrapper.text()).toContain("Mes comptes");
    expect(wrapper.text()).toContain("Profils de référence");

    const ownerSection = wrapper.find(".accounts-grid--owner");
    expect(ownerSection.exists()).toBe(true);
    expect(ownerSection.text()).toContain("Spadzze");
    expect(ownerSection.text()).toContain("AceOfSpadzze");
    expect(ownerSection.text().toLowerCase()).not.toContain("vangy");
    expect(ownerSection.text().toLowerCase()).not.toContain("vlintter");

    const permanentSection = wrapper.find(".accounts-grid--permanent");
    expect(permanentSection.exists()).toBe(true);
    expect(permanentSection.text()).toContain("Vangy");
    expect(permanentSection.text()).toContain("Vlintter");
    expect(permanentSection.text().toLowerCase()).not.toContain("spadzze");
  });

  it("affiche les pseudos avec une majuscule au début", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });
    const slugs = wrapper.findAll(".ac-slug").map((el) => el.text());
    expect(slugs).toEqual(["Spadzze", "AceOfSpadzze", "Vangy", "Vlintter"]);
  });

  it("classe automatiquement les nouveaux comptes selon le champ group", () => {
    const extendedAccounts = [
      ...sampleAccounts,
      { slug: "new-smurf", riot_id: "Smurf#euw", region: "euw1", group: "owner", games_count: 5, last_review_ts: null },
      { slug: "new-benchmark", riot_id: "Pro#kr", region: "kr", group: "permanent", games_count: 100, last_review_ts: null },
    ];

    const wrapper = mount(HomePage, {
      props: { accounts: extendedAccounts, loading: false },
    });

    const ownerSection = wrapper.find(".accounts-grid--owner");
    expect(ownerSection.text()).toContain("Smurf");
    expect(ownerSection.text()).not.toContain("Pro");

    const permanentSection = wrapper.find(".accounts-grid--permanent");
    expect(permanentSection.text()).toContain("Pro");
    expect(permanentSection.text()).not.toContain("Smurf");
  });

  it("navigue vers le profil du compte lors d'un clic", async () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });

    const firstCard = wrapper.find(".account-card--owner");
    await firstCard.trigger("click");
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith("/c/spadzze");
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("affiche 'parties enregistrées' et le modèle dans le hero et les cartes", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });

    expect(wrapper.text()).toContain("parties enregistrées");
    expect(wrapper.text()).toContain("Analyse de performance et coaching tactique");
    expect(wrapper.text()).toContain("60 parties enregistrées");
  });

  it("navigue vers le profil de démo complet Spadzze avec le match ciblé au clic", async () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });
    const demoLink = wrapper.find(".hero-demo-link");
    expect(demoLink.exists()).toBe(true);
    expect(demoLink.text()).toContain("Tester la démo complète (Spadzze#EUW)");

    await demoLink.trigger("click");
    expect(pushMock).toHaveBeenCalledWith({ path: "/c/spadzze", query: { review: "EUW1_7898084645" } });
  });

  it("intègre la toile de fond Targon transparente et ne contient pas la carte de preview Spadzze", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });
    expect(wrapper.find(".hero-preview-card").exists()).toBe(false);
    expect(wrapper.find(".home-targon-backdrop").exists()).toBe(true);
    expect(wrapper.find(".targon-landscape-layer").exists()).toBe(true);
    expect(wrapper.find(".targon-astrolabe-layer").exists()).toBe(true);
  });

  it("n'affiche PAS la section des comptes du navigateur si aucun compte local n'est présent", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, recentAccounts: [], loading: false },
    });

    expect(wrapper.find(".home-section--browser").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Joueurs récemment consultés");
  });

  it("affiche la section des comptes du navigateur juste au-dessus de 'Mes comptes' quand des comptes locaux sont présents", () => {
    const localAccounts = [
      { slug: "faker", riot_id: "Hide on bush#KR1", region: "kr", last_visited_at: "2026-09-17T18:00:00Z", games_count: 20 },
    ];
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, recentAccounts: localAccounts, loading: false },
    });

    const browserSection = wrapper.find(".home-section--browser");
    expect(browserSection.exists()).toBe(true);
    expect(browserSection.text()).toContain("Joueurs récemment consultés");
    expect(browserSection.text()).toContain("Hide on bush#KR1");

    // Vérifie que la section navigateur se trouve avant "Mes comptes" dans le DOM
    const sections = wrapper.findAll(".home-section");
    expect(sections.length).toBe(3); // Browser, Owner, Permanent
    expect(sections[0].classes()).toContain("home-section--browser");
    expect(sections[1].text()).toContain("Mes comptes");
    expect(sections[2].text()).toContain("Profils de référence");
  });

  it("ne duplique pas dans la section navigateur les comptes qui sont déjà dans Mes comptes ou Comptes permanents", () => {
    const localAccountsWithDuplicates = [
      { slug: "spadzze", riot_id: "Spadzze#euw", region: "euw1", last_visited_at: "2026-09-17T18:00:00Z" },
      { slug: "custom-user", riot_id: "Custom#EUW", region: "euw1", last_visited_at: "2026-09-17T18:00:00Z" },
    ];
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, recentAccounts: localAccountsWithDuplicates, loading: false },
    });

    const browserGrid = wrapper.find(".accounts-grid--browser");
    expect(browserGrid.exists()).toBe(true);
    expect(browserGrid.text()).toContain("Custom#EUW");
    expect(browserGrid.text()).not.toContain("Spadzze#euw");
  });

  it("permet de retirer un compte stocké dans le navigateur", async () => {
    const localAccounts = [
      { slug: "faker", riot_id: "Hide on bush#KR1", region: "kr", last_visited_at: "2026-09-17T18:00:00Z" },
    ];
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, recentAccounts: localAccounts, loading: false },
    });

    const removeBtn = wrapper.find(".btn-remove-stored-account");
    expect(removeBtn.exists()).toBe(true);

    await removeBtn.trigger("click");
    await flushPromises();

    // Le compte retiré fait disparaître la section conditionnelle
    expect(wrapper.find(".home-section--browser").exists()).toBe(false);
  });

  it("compile avec les styles scoped de Vue", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });
    expect(Object.keys(wrapper.element.attributes).some(k => wrapper.element.attributes[Number(k)]?.name?.startsWith("data-v-"))).toBe(true);
  });

  it("affiche les rangs sur les cartes et retire les tags 'Mon compte' et 'Référence'", () => {
    const wrapper = mount(HomePage, {
      props: { accounts: sampleAccounts, loading: false },
    });

    const rankBadges = wrapper.findAll(".badge-rank");
    expect(rankBadges.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("Diamant II");
    expect(wrapper.text()).toContain("Master");
    expect(wrapper.text()).toContain("Or I");

    expect(wrapper.find(".badge-owner-tag").exists()).toBe(false);
    expect(wrapper.find(".badge-permanent-tag").exists()).toBe(false);
  });
});


