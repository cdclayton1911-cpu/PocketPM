import { NextResponse, type NextRequest } from "next/server";

/**
 * Route guard.
 *
 * This is `proxy.ts`, not `middleware.ts`: the middleware file convention is
 * deprecated in Next.js 16 and renamed to proxy, with the function exported as
 * `proxy`. See node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md.
 *
 * OPTIMISTIC CHECK ONLY. This runs on every matched request including
 * prefetches, and may be deployed to a CDN edge, so it does no network calls and
 * imports nothing from the app. It reads the cookie, decodes the JWT payload
 * WITHOUT verifying the signature, and redirects on missing-or-expired.
 *
 * A forged payload gains nothing: it only gets past this redirect. Every request
 * that actually touches data is verified by PocketBase, and the (app) layout
 * calls getSession(), which validates the token properly.
 */

const SESSION_COOKIE = "pb_auth";

/** Reachable without a session. Everything else under the matcher is guarded. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

/** Signed-in users are bounced away from these back into the app. */
const AUTH_ONLY_PATHS = ["/login", "/signup"];

/**
 * Expiry from a JWT payload, without signature verification.
 *
 * Inlined rather than imported from lib/session: the docs warn against relying
 * on shared modules in proxy, and lib/session pulls in next/headers and the
 * PocketBase SDK, neither of which belongs in an edge bundle.
 */
function tokenExpirySeconds(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function hasLiveToken(token: string | undefined): boolean {
  if (!token) return false;
  const exp = tokenExpirySeconds(token);
  if (exp === null) return false; // unparseable — treat as no session
  return exp > Math.floor(Date.now() / 1000);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasLiveToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (signedIn && AUTH_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!signedIn) {
    const url = new URL("/login", request.url);
    // Preserve where they were headed, so login can send them back. The value is
    // validated with safeRedirectPath() before use — never trusted as-is.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(url);
    // Drop a stale or malformed cookie so it stops being re-sent.
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except API routes, Next internals, and static assets.
   *
   * `/api/auth/*` in particular must NOT be guarded: login and signup are how
   * you get a session in the first place, and guarding them would deadlock.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
