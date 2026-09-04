import { defineConfig, devices } from "@playwright/test";

import { PB_URL } from "./scripts/e2e-pocketbase.mjs";

/**
 * E2E runs against a throwaway PocketBase and its own Next.js server.
 *
 * Nothing here touches the real instance. `globalSetup` starts an ephemeral
 * PocketBase provisioned from docs/pb_schema.json; `webServer` starts the app
 * on port 3100 pointed at it, so a dev server on 3000 is left alone.
 */
const E2E_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    /**
     * `localhost`, never `127.0.0.1`.
     *
     * A production build marks the session cookie `Secure`, and Playwright's
     * request context honours that strictly over plain http — the cookie is
     * stored but never sent, so every authenticated call 401s. Chrome's
     * trustworthy-origin exception applies to `localhost` but not to the bare
     * IP. Verified both ways: 127.0.0.1 gave /api/auth/me 401, localhost 200.
     */
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  /**
   * A production build served on its own port.
   *
   * Not `next dev`: Next 16 refuses a second dev server in the same directory,
   * and the one on 3000 is the one being worked in. Building also makes this
   * closer to what actually ships.
   *
   * NEXT_DIST_DIR keeps the E2E build in `.next-e2e`, so it never overwrites
   * the `.next` a running dev server is serving from.
   *
   * NEXT_PUBLIC_PB_URL is read by a server-only module with a fallback, so
   * setting it at runtime is enough — it is not inlined into a client bundle,
   * which is why one build works for any target instance.
   */
  webServer: {
    command: `npm run build && npm run start -- --port ${E2E_PORT} --hostname 127.0.0.1`,
    url: `http://localhost:${E2E_PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      // The whole point: the app under test talks to the ephemeral instance,
      // never to pb.pocketpm.fyi.
      NEXT_PUBLIC_PB_URL: PB_URL,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
