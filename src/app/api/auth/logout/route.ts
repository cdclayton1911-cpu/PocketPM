import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/session";

/**
 * POST, not GET: a logout reachable by navigation could be triggered by any
 * image or link pointing at it.
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
