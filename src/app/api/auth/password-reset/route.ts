import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { rateLimit } from "@/lib/rate-limit";
import { fieldErrorsFromZod, passwordResetRequestSchema } from "@/lib/validation/auth";

/**
 * Request a password reset email.
 *
 * Two properties this must hold:
 *
 *  1. **No account enumeration.** The response is identical whether or not an
 *     account exists, matching the login and signup handlers. PocketBase's own
 *     endpoint behaves this way; the catch-all below makes sure a transport
 *     failure cannot leak the difference either.
 *  2. **Rate limited.** This is an unauthenticated endpoint that causes mail to
 *     be sent to an address the caller chooses — without a limit it is both a
 *     spam cannon aimed at third parties and a way to burn an SMTP quota. There
 *     is no session to key on, so it is limited per address and per client IP,
 *     and both must pass.
 */

/** Per email address: enough for a genuine retry, not enough to harass. */
const PER_EMAIL_LIMIT = 3;
const PER_EMAIL_WINDOW_MS = 60 * 60 * 1000;

/** Per client IP, to catch someone cycling through many addresses. */
const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Client IP for rate limiting.
 *
 * Trusts `x-forwarded-for` because in this deployment Caddy sets it and the app
 * is bound to loopback (see deploy/Caddyfile and pocketpm-web.service), so a
 * client cannot reach Next.js directly to forge it. If the app is ever exposed
 * without that proxy in front, this header becomes attacker-controlled and the
 * IP limit becomes worthless — the per-address limit is the one that still
 * holds.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** The one response this endpoint gives, whatever happened. */
function accepted() {
  return NextResponse.json({
    message: "If an account exists for that address, a reset link is on its way.",
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    // A malformed address is the caller's own mistake and says nothing about
    // who has an account, so this one is safe to report.
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  const ip = rateLimit(`pwreset:ip:${clientIp(request)}`, PER_IP_LIMIT, PER_IP_WINDOW_MS);
  const address = rateLimit(`pwreset:email:${email}`, PER_EMAIL_LIMIT, PER_EMAIL_WINDOW_MS);

  if (!ip.ok || !address.ok) {
    const retryAfter = Math.max(ip.retryAfter, address.retryAfter);
    return NextResponse.json(
      { errors: { form: "Too many reset requests. Try again later." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    await createClient().collection("users").requestPasswordReset(email);
  } catch (error) {
    // Swallowed on purpose: a 404 for "no such account" and a 500 for "SMTP is
    // down" must be indistinguishable to the caller. Logged so an operator can
    // see the difference — mail delivery failing silently is exactly the thing
    // that makes a reset feature look like it works when it does not.
    console.error("[password-reset] request failed:", error);
  }

  return accepted();
}
