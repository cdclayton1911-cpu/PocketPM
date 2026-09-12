import { execSync } from "node:child_process";

import type { NextConfig } from "next";

/**
 * The commit this build was made from, inlined at build time and served by
 * /api/version. Deploy compares it with the commit it just built, so a health
 * check proves the RIGHT version answered, not merely that something did.
 */
function buildCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  /**
   * Overridable build output directory.
   *
   * E2E builds into `.next-e2e` so a `next build` for tests does not overwrite
   * the `.next` a running dev server is serving from — which would destabilise
   * the dev server mid-run. Unset everywhere else, so production and normal
   * development are unaffected.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { BUILD_COMMIT: buildCommit() },
};

export default nextConfig;
