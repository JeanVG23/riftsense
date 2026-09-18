// Vitest 4 + Node 25 can expose an inert Storage object before jsdom hydrates it.
// This keeps the browser-side suites deterministic without touching production code.
const store = new Map<string, string>();

const storage = {
  get length() { return store.size; },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(String(key), String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
};

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

import { afterEach } from "vitest";
afterEach(() => { store.clear(); });
