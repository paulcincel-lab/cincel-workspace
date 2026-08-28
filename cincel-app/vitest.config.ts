import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: [],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts", "lib/data/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws on import outside an RSC bundle; stub it in tests.
      "server-only": resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
});
