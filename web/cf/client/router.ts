import {
  createRouter,
  createWebHistory,
  type RouteLocationResolvedGeneric,
  type RouteRecordRaw,
} from "vue-router";

export type AppRoute =
  | { name: "home" }
  | { name: "readme" }
  | { name: "terms" }
  | { name: "privacy" }
  | { name: "register"; slug: string }
  | { name: "account"; slug: string };

export const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: {} },
  { path: "/demo", redirect: "/c/spadzze?review=EUW1_7898084645" },
  { path: "/case-study", redirect: "/c/spadzze?review=EUW1_7898084645" },
  { path: "/readme", name: "readme", component: {} },
  { path: "/terms", name: "terms", component: {} },
  { path: "/privacy", name: "privacy", component: {} },
  { path: "/register/:slug", name: "register", component: {} },
  { path: "/c/:slug", name: "account", component: {} },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }
    if (to.path !== from.path) {
      return { top: 0, left: 0 };
    }
    return undefined;
  },
});

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function toAppRoute(route: RouteLocationResolvedGeneric): AppRoute {
  if (route.name === "account") {
    return { name: "account", slug: firstParam(route.params.slug) };
  }
  if (route.name === "register") {
    return { name: "register", slug: firstParam(route.params.slug) };
  }
  if (route.path === "/demo" || route.path === "/case-study") return { name: "account", slug: "spadzze" };
  if (route.name === "readme" || route.path === "/readme") return { name: "readme" };
  if (route.name === "terms" || route.path === "/terms") return { name: "terms" };
  if (route.name === "privacy" || route.path === "/privacy") return { name: "privacy" };
  return { name: "home" };
}

/** Résolution synchrone utile aux tests et aux intégrations hors composant. */
export function resolveAppRoute(path: string): AppRoute {
  return toAppRoute(router.resolve(path));
}
