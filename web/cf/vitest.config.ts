import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue({ customElement: false })],
  test: {
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "client/**/*.test.ts"],
  },
});
