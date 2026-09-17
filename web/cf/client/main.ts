import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

function syncCanonical(): void {
  const href = location.origin + location.pathname;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", href);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", href);
}

syncCanonical();
router.afterEach(syncCanonical);
createApp(App).use(router).mount("#app");
