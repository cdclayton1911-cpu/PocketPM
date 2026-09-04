import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config.
 *
 * Assumes a dev server is already running on 3000 — `webServer` is deliberately
 * not configured, because starting one here would fight the long-lived dev
 * server this project is worked on with.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
