// Server-only: importing this from a client component is a BUILD ERROR. It
// reads the session cookie and speaks to PocketBase on the user's behalf.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient, isPbError, type PbAuthResponse } from "@/lib/pocketbase";
import type { User } from "@/types";

/** Cookie holding the PocketBase auth token. Never readable from client JS. */
export const SESSION_COOKIE = "pb_auth";

/**
 * PocketBase issues tokens with a 14-day lifetime
 * (`authToken.duration: 1209600` in docs/pb_schema.json).
 */
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

/** Refresh when the token has less than this long left. */
const REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 3;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" rather than "strict": ordinary inbound links keep working, while the
    // cookie is still withheld from cross-site POSTs, which is the CSRF case
    // that matters for these handlers.
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(TOKEN_TTL_SECONDS));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Overwrite with an expired cookie as well as deleting, so the browser drops
  // it even if a stale Set-Cookie is cached somewhere in between.
  store.set(SESSION_COOKIE, "", cookieOptions(0));
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/**
 * Decode a JWT payload WITHOUT verifying its signature.
 *
 * Only ever used for cheap expiry checks where a forged payload gains nothing —
 * every request that actually touches data is verified by PocketBase. Never use
 * this to decide that a token is *valid*.
 */
export function decodeTokenPayload(token: string): { exp?: number; id?: string } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as { exp?: number; id?: string };
  } catch {
    return null;
  }
}

/** Seconds until the token expires; negative when already expired. */
export function secondsUntilExpiry(token: string): number | null {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return null;
  return payload.exp - Math.floor(Date.now() / 1000);
}

export interface Session {
  user: User;
  token: string;
}

/**
 * The authoritative session check: asks PocketBase to validate the token.
 *
 * `authRefresh` both verifies the token and returns a fresh one, so this
 * doubles as the auto-refresh. Returns null when there is no valid session —
 * callers decide whether that is a redirect or a 401.
 */
export async function getSession(): Promise<Session | null> {
  const token = await readSessionToken();
  if (!token) return null;

  // Cheap pre-check: don't spend a network call on an obviously dead token.
  const remaining = secondsUntilExpiry(token);
  if (remaining !== null && remaining <= 0) {
    await clearSessionCookie();
    return null;
  }

  try {
    const pb = createClient(token);
    const refreshed = (await pb.collection("users").authRefresh()) as unknown as PbAuthResponse;

    // Re-set the cookie only when the token is close to expiry. Writing a cookie
    // on every request would be wasted work, and cookie writes from a server
    // component are ignored outside a route handler or action anyway.
    if (remaining !== null && remaining < REFRESH_THRESHOLD_SECONDS && refreshed.token) {
      try {
        await setSessionCookie(refreshed.token);
      } catch {
        // Server components cannot set cookies; the /api/auth/refresh handler
        // covers that case. Not fatal — the current token is still valid.
      }
    }

    return { user: refreshed.record, token: refreshed.token || token };
  } catch (err) {
    // Distinguish "PocketBase rejected this token" from "PocketBase could not
    // be reached". Treating both as no-session logs a signed-in user out on a
    // network blip or an upstream 5xx — observed during the daily-log
    // verification, where a token that PocketBase accepted directly still
    // produced a 401 from this app.
    //
    // Only a 401/403 is evidence the token is bad. On anything else the token
    // is kept: it has already passed the local expiry check, and every call
    // that actually touches data is verified by PocketBase anyway, so a truly
    // invalid token still fails there rather than being trusted here.
    if (!isPbError(err) || (err.status !== 401 && err.status !== 403)) {
      // No session for this request — the user record could not be fetched and
      // synthesising a partial one would put a blank name in the topbar and a
      // wrong id in front of PocketBase. But the cookie is left alone, so the
      // next request recovers instead of the user being signed out for good.
      return null;
    }

    // Invalid, revoked, or the user was deleted.
    try {
      await clearSessionCookie();
    } catch {
      // Same as above — read-only context. The proxy will catch it next request.
    }
    return null;
  }
}

/**
 * Session or redirect to login. For use in server components and layouts.
 *
 * @param returnTo - Path to send the user back to after signing in.
 */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/login${next}`);
  }
  return session;
}
