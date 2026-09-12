import { NextResponse } from "next/server";

/**
 * Which commit production is running. Public on purpose: a commit hash of an
 * app whose source is on GitHub reveals nothing, and deploy's health check and
 * any rollback need it without a session. /api is outside the proxy matcher.
 */
export function GET() {
  return NextResponse.json(
    { commit: process.env.BUILD_COMMIT ?? "unknown" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
