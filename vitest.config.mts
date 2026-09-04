import { defineConfig } from "vitest/config";

/**
 * Unit tests only. E2E is Playwright (see playwright.config.ts) — pointing
 * Vitest at `e2e/` would try to run Playwright specs in a Node environment.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
