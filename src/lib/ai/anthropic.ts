// Server-only: holds ANTHROPIC_API_KEY. A client import must be a build error —
// the key is the one secret in this app whose leak is immediately spendable.
import "server-only";

/**
 * Minimal Anthropic Messages API client.
 *
 * ## Why raw fetch and not @anthropic-ai/sdk
 *
 * The official SDK is the better choice and would give typed errors, retries,
 * and streaming helpers for free. It is not installed because the project brief
 * says to ask before adding a dependency that is not in the approved stack, and
 * that has not been asked yet. Everything Anthropic-specific is confined to this
 * one file so the swap is a rewrite of ~80 lines and nothing else.
 *
 * ## Not streaming
 *
 * These are single-shot drafting calls with modest `max_tokens` (2k–8k), well
 * inside the request timeout. Streaming becomes worth its complexity when the AI
 * modules gain token-by-token UI; hand-rolling an SSE parser before there is a
 * consumer for it would be speculative.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/**
 * Claude Opus 5. Thinking is on by default on this model, so the `thinking`
 * parameter is deliberately omitted rather than set — and `budget_tokens` is
 * rejected with a 400 here, so any older thinking-budget pattern is wrong.
 */
const MODEL = "claude-opus-5";

/** Guards against an upstream hang holding a Next.js request open. */
const TIMEOUT_MS = 120_000;

export type AiFailure =
  /** ANTHROPIC_API_KEY is not set on this server. */
  | { kind: "not_configured" }
  /** The key is rejected, or the account is out of credit. */
  | { kind: "credentials"; message: string }
  /** Anthropic's own rate limit, distinct from this app's per-user limit. */
  | { kind: "upstream_rate_limited"; retryAfter?: number }
  /** Claude declined the request. */
  | { kind: "refused"; message: string }
  /** Anything else: overloaded, network failure, timeout, malformed response. */
  | { kind: "unavailable"; message: string };

export type AiResult = { ok: true; text: string } | { ok: false; failure: AiFailure };

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  stop_details?: { explanation?: string } | null;
}

/** Anthropic's error envelope: `{ type: "error", error: { type, message } }`. */
function readUpstreamError(body: unknown): { type: string; message: string } {
  const error = (body as { error?: { type?: string; message?: string } })?.error;
  return { type: error?.type ?? "unknown", message: error?.message ?? "" };
}

export async function complete(args: {
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, failure: { kind: "not_configured" } };

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: args.maxTokens,
        system: args.system,
        // "medium" rather than the default "high": these are drafting tasks, and
        // effort is the first lever that trades tokens for depth.
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: args.prompt }],
      }),
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "unavailable",
        message: error instanceof Error ? error.message : "Could not reach Anthropic",
      },
    };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const { type, message } = readUpstreamError(body);

    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const retryAfter = header ? Number(header) : undefined;
      return {
        ok: false,
        failure: {
          kind: "upstream_rate_limited",
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
        },
      };
    }

    // 401 is a bad key. An exhausted credit balance arrives as a 400 whose
    // message names it — worth separating, because the operator fix is
    // different and this account has actually been in that state.
    if (response.status === 401 || response.status === 403 || /credit balance/i.test(message)) {
      return { ok: false, failure: { kind: "credentials", message } };
    }

    return {
      ok: false,
      failure: { kind: "unavailable", message: message || `${type} (HTTP ${response.status})` },
    };
  }

  const data = body as AnthropicResponse;

  if (data.stop_reason === "refusal") {
    return {
      ok: false,
      failure: {
        kind: "refused",
        message: data.stop_details?.explanation || "Claude declined this request.",
      },
    };
  }

  // Thinking blocks share the content array; only text blocks are the answer.
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();

  if (!text) {
    return { ok: false, failure: { kind: "unavailable", message: "Empty response" } };
  }

  return { ok: true, text };
}
