import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";
import "./styles/legal.css";

function syncCanonical(): void {
  const href = location.origin + location.pathname;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", href);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", href);
}

syncCanonical();
router.afterEach((to, from) => {
  if (to.path !== from.path) {
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }
});
router.afterEach(syncCanonical);
createApp(App).use(router).mount("#app");
