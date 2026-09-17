import {
  createRouter,
  createWebHistory,
  type RouteLocationResolvedGeneric,
  type RouteRecordRaw,
} from "vue-router";

export type AppRoute =
  | { name: "home" }
  | { name: "readme" }
  | { name: "register"; slug: string }
  | { name: "account"; slug: string };

export const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: {} },
  { path: "/readme", name: "readme", component: {} },
  { path: "/register/:slug", name: "register", component: {} },
  { path: "/c/:slug", name: "account", component: {} },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
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
  if (route.name === "readme") return { name: "readme" };
  return { name: "home" };
}

/** Résolution synchrone utile aux tests et aux intégrations hors composant. */
export function resolveAppRoute(path: string): AppRoute {
  return toAppRoute(router.resolve(path));
}
