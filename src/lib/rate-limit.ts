// Server-only: the limiter's state is a module-level Map. Importing it from a
// client component would silently create a second, per-browser copy that
// enforces nothing.
import "server-only";

/**
 * Fixed-window per-key rate limiter.
 *
 * ## Why this exists
 *
 * The Express proxy this replaces (`POST /api/claude` on api.pocketpm.fyi) had
 * `cors()` and `express.json()` and nothing else: no auth, no limit. An
 * unauthenticated request from anywhere on the internet reached Anthropic and
 * spent the account's credits. This is half the fix; the auth gate in
 * `src/app/api/ai/[task]/route.ts` is the other half.
 *
 * ## Known limitation — read before scaling out
 *
 * The counters live in this process's memory. That is correct for the current
 * deployment (one `next start` process behind Caddy, `deploy/pocketpm-web.service`)
 * and wrong the moment there is a second instance, because each would allow the
 * full quota. It also resets on deploy, which is a small free-quota gift after
 * every restart rather than a security problem.
 *
 * When the app is scaled or moved to serverless this must become shared state.
 * PocketBase can hold it without a new dependency; Redis would be better and is
 * a dependency conversation. Deliberately not built for that yet — a distributed
 * limiter that is never deployed distributed is speculative complexity.
 */

interface Window {
  count: number;
  /** Epoch ms at which this window ends and the count resets. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Drop expired windows.
 *
 * Called on each check rather than on a timer: a `setInterval` in a module body
 * runs during the build's module evaluation and holds the process open. This
 * costs a pass over the map only once the map is large enough to matter.
 */
function sweep(now: number): void {
  if (windows.size < 1000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests still allowed in this window. */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Whole seconds until reset, for a Retry-After header. */
  retryAfter: number;
}

/**
 * Count one request against `key`.
 *
 * Counts the *attempt*, not the success. A caller that fails after this point
 * has still consumed quota — which is the intent: a client retrying a failing
 * expensive call is exactly what needs slowing down.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  const window =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  window.count += 1;
  windows.set(key, window);

  const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  return {
    ok: window.count <= limit,
    remaining: Math.max(0, limit - window.count),
    resetAt: window.resetAt,
    retryAfter,
  };
}

/** Test seam. Not called by the app. */
export function resetRateLimits(): void {
  windows.clear();
}
