import { NextResponse } from "next/server";

import { createClient, type PbAuthResponse } from "@/lib/pocketbase";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/session";

/**
 * Exchange the current token for a fresh one and re-set the cookie.
 *
 * `getSession()` refreshes opportunistically, but a server component cannot
 * write cookies — so this handler exists for the cases that need the new token
 * actually persisted.
 */
export async function POST() {
  const token = await readSessionToken();
  if (!token) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  try {
    const pb = createClient(token);
    const refreshed = (await pb.collection("users").authRefresh()) as unknown as PbAuthResponse;

    await setSessionCookie(refreshed.token);
    return NextResponse.json({ user: refreshed.record });
  } catch {
    await clearSessionCookie();
    return NextResponse.json({ errors: { form: "Session expired" } }, { status: 401 });
  }
}
