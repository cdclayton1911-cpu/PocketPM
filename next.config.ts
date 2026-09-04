import type { NextConfig } from "next";

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
};

export default nextConfig;
