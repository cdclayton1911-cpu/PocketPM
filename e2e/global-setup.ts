import { startEphemeralPocketBase } from "../scripts/e2e-pocketbase.mjs";

/**
 * Bring up a throwaway PocketBase before the suite and tear it down after.
 *
 * Playwright treats a function returned from globalSetup as the teardown, which
 * keeps the running handle in one closure instead of a module-level singleton
 * shared across two files.
 *
 * The app under test is started separately by `webServer` in the config,
 * pointed at this instance by NEXT_PUBLIC_PB_URL. The port is fixed rather than
 * assigned, so the two do not need to agree on a value at runtime — which also
 * makes their start order irrelevant, since the app connects to PocketBase
 * lazily per request rather than at boot.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const instance = await startEphemeralPocketBase();
  return async () => {
    await instance.stop();
  };
}
