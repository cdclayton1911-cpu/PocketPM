import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Unit tests only. E2E is Playwright (see playwright.config.ts) — pointing
 * Vitest at `e2e/` would try to run Playwright specs in a Node environment.
 */
export default defineConfig({
  // Mirrors the "@/*" path alias in tsconfig.json. Without it any test that
  // reaches a module importing "@/types" fails to resolve at run time, which
  // limited tests to dependency-free files.
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
