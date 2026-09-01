// Server-only: holds ANTHROPIC_API_KEY. A client import must be a build error —
// the key is the one secret in this app whose leak is immediately spendable.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic Messages API client.
 *
 * ## Not streaming
 *
 * These are single-shot drafting calls with modest `max_tokens` (2k–8k), well
 * inside the request timeout. Streaming becomes worth its complexity when the AI
 * modules gain token-by-token UI; there is no consumer for it yet.
 */

/**
 * Claude Opus 5. Thinking is on by default on this model, so the `thinking`
 * parameter is deliberately omitted rather than set — and `budget_tokens` is
 * rejected with a 400 here, so any older thinking-budget pattern is wrong.
 */
const MODEL = "claude-opus-5";

/** Guards against an upstream hang holding a Next.js request open. */
const TIMEOUT_MS = 120_000;

/**
 * Retries per request, on top of the original attempt.
 *
 * The SDK retries connection errors, 408, 409, 429, and 5xx with exponential
 * backoff and honours `retry-after`. It does NOT retry a 400 or 401, which is
 * right: a malformed request and a bad key do not improve on a second attempt.
 *
 * Two, not more: this runs inside a user's request, and the per-user hourly
 * quota already counts the attempt, so a long retry chain would hold a
 * connection open without buying much.
 */
const MAX_RETRIES = 2;

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

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
}

export type AiResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; failure: AiFailure };

/**
 * Built once and reused, so the SDK's connection pooling actually applies.
 * Lazy rather than at module scope: the key is read at first use, which keeps
 * importing this module harmless when it is unset.
 */
let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  /**
   * Identity-linked API keys must name the workspace they act in; without it
   * every endpoint returns a 400, including `GET /v1/models`. A plain workspace
   * key needs no header, so this is set only when configured.
   *
   * The workspace id is an identifier, not a credential — but it lives beside
   * the key in the server environment because that is where the rest of this
   * client's configuration is.
   */
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

  client ??= new Anthropic({
    apiKey,
    maxRetries: MAX_RETRIES,
    timeout: TIMEOUT_MS,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
  return client;
}

/** Test seam: drops the memoised client so a changed key is picked up. */
export function resetAnthropicClient(): void {
  client = null;
}

function toFailure(error: unknown): AiFailure {
  // Most specific first. `error.error` carries Anthropic's own envelope.
  if (error instanceof Anthropic.RateLimitError) {
    const header = error.headers?.get("retry-after");
    const retryAfter = header ? Number(header) : NaN;
    return {
      kind: "upstream_rate_limited",
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    };
  }

  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { kind: "credentials", message: error.message };
  }

  // An exhausted credit balance arrives as a 400 whose message names it —
  // separated from other bad requests because the operator fix is different and
  // this account has actually been in that state.
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    return { kind: "credentials", message: error.message };
  }

  // A 400 naming the workspace header is a configuration fault: the key is
  // identity-linked and ANTHROPIC_WORKSPACE_ID is unset or wrong. Retrying
  // never fixes it, so it must not read as a transient outage.
  if (error instanceof Anthropic.BadRequestError && /anthropic-workspace-id/i.test(error.message)) {
    return { kind: "not_configured" };
  }

  if (error instanceof Anthropic.APIError) {
    return { kind: "unavailable", message: error.message };
  }

  return {
    kind: "unavailable",
    message: error instanceof Error ? error.message : "Could not reach Anthropic",
  };
}

export async function complete(args: {
  system: string;
  prompt: string;
  maxTokens: number;
  /** Prior turns, oldest first. The API is stateless, so they are resent. */
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<AiResult> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, failure: { kind: "not_configured" } };

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      // "medium" rather than the default "high": these are drafting tasks, and
      // effort is the first lever that trades tokens for depth.
      output_config: { effort: "medium" },
      messages: [...(args.history ?? []), { role: "user", content: args.prompt }],
    });
  } catch (error) {
    return { ok: false, failure: toFailure(error) };
  }

  // stop_details is populated only for a refusal, so guard before reading it.
  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      failure: {
        kind: "refused",
        message: message.stop_details?.explanation || "Claude declined this request.",
      },
    };
  }

  // Thinking blocks share the content array; only text blocks are the answer.
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    return { ok: false, failure: { kind: "unavailable", message: "Empty response" } };
  }

  return {
    ok: true,
    text,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}
