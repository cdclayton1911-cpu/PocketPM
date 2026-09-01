import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActiveProjectId } from "@/lib/active-project";
import { complete, type AiFailure } from "@/lib/ai/anthropic";
import { AI_TASKS, BASE_SYSTEM, isAiTaskName } from "@/lib/ai/tasks";
import { createClient } from "@/lib/pocketbase";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import type { Project } from "@/types";

/**
 * The single AI endpoint: `POST /api/ai/<task>`.
 *
 * Replaces `POST /api/claude` on api.pocketpm.fyi, which had neither of the two
 * things this handler exists for:
 *
 *  1. **An auth gate.** That route was `app.use(cors())` plus `express.json()`.
 *     An unauthenticated request from any origin reached Anthropic and spent
 *     real credits. Here an unsigned-in caller gets 401 before anything is sent
 *     upstream.
 *  2. **A per-user rate limit.** There was none, so one authenticated user — or
 *     a loop in the client — could drain the account. Here each user gets a
 *     fixed hourly quota, keyed by PocketBase user id rather than IP so that
 *     sharing an office NAT does not share a quota, and so a quota cannot be
 *     reset by changing address.
 *
 * The system prompt and the model are chosen server-side. The client sends a
 * task name and typed inputs, never a prompt — otherwise the endpoint is an
 * open Anthropic proxy wearing a login page.
 */

/** Requests per user per window. Env-overridable for a busier deployment. */
const LIMIT = Number(process.env.AI_RATE_LIMIT_PER_HOUR) || 20;
const WINDOW_MS = 60 * 60 * 1000;

const bodySchema = z.object({ input: z.unknown() });

/** Maps an upstream failure to a status and a message safe to show a user. */
function failureResponse(failure: AiFailure): NextResponse {
  switch (failure.kind) {
    case "not_configured":
      // 503, not 500: the code is fine, the server is missing a key. Says so
      // plainly rather than rendering as a mystery error — the operator fix is
      // to set ANTHROPIC_API_KEY and restart.
      return NextResponse.json(
        { errors: { form: "AI is not configured on this server." } },
        { status: 503 },
      );
    case "credentials":
      // Never echo the upstream message: it can carry account details. Logged
      // for the operator instead.
      console.error("[ai] credentials/billing failure:", failure.message);
      return NextResponse.json(
        { errors: { form: "AI is unavailable: the Anthropic account is not able to serve requests." } },
        { status: 503 },
      );
    case "upstream_rate_limited":
      return NextResponse.json(
        { errors: { form: "Anthropic is rate limiting this account. Try again shortly." } },
        { status: 429, headers: failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : undefined },
      );
    case "refused":
      return NextResponse.json({ errors: { form: failure.message } }, { status: 422 });
    case "unavailable":
      console.error("[ai] upstream failure:", failure.message);
      return NextResponse.json(
        { errors: { form: "The AI service did not respond. Try again." } },
        { status: 502 },
      );
  }
}

/**
 * Project facts appended to the system prompt.
 *
 * Read server-side from the active-project cookie and PocketBase rather than
 * taken from the request. The prototype posted a `project_context` object from
 * the browser, which meant the model's idea of the project was whatever the
 * client claimed — including another tenant's name and contract value.
 */
async function projectContext(token: string): Promise<string> {
  const projectId = await resolveActiveProjectId(token);
  if (!projectId) return "";
  try {
    const pb = createClient(token);
    // Fetched as the user: PocketBase's rule 404s a project they are not on, so
    // a forged cookie cannot pull another tenant's details into the prompt.
    const project = await pb.collection("projects").getOne<Project>(projectId);
    return [
      "\n\nCurrent project:",
      `- Name: ${project.name}`,
      project.project_type ? `- Type: ${project.project_type}` : null,
      project.contract_type ? `- Contract: ${project.contract_type}` : null,
      project.contract_value ? `- Contract value: $${project.contract_value.toLocaleString()}` : null,
      [project.city, project.state].filter(Boolean).length
        ? `- Location: ${[project.city, project.state].filter(Boolean).join(", ")}`
        : null,
      project.owner_name ? `- Owner: ${project.owner_name}` : null,
      project.architect_name ? `- Architect: ${project.architect_name}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    // A missing project weakens the answer; it should not fail the request.
    return "";
  }
}

export async function POST(request: Request, { params }: RouteContext<"/api/ai/[task]">) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  const { task } = await params;
  if (!isAiTaskName(task)) {
    return NextResponse.json({ errors: { form: "Unknown AI task" } }, { status: 404 });
  }

  // After auth so an anonymous flood cannot fill the map, before any upstream
  // call so a limited request costs nothing.
  const limit = rateLimit(`ai:${session.user.id}`, LIMIT, WINDOW_MS);
  const headers = {
    "RateLimit-Limit": String(LIMIT),
    "RateLimit-Remaining": String(limit.remaining),
    "RateLimit-Reset": String(limit.retryAfter),
  };
  if (!limit.ok) {
    return NextResponse.json(
      {
        errors: {
          form: `AI request limit reached (${LIMIT} per hour). Try again in ${Math.ceil(limit.retryAfter / 60)} min.`,
        },
      },
      { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfter) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const envelope = bodySchema.safeParse(raw);
  if (!envelope.success) {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const definition = AI_TASKS[task];
  const parsed = definition.schema.safeParse(envelope.data.input);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400, headers });
  }

  const result = await complete({
    system: `${BASE_SYSTEM}\n\n${definition.system}${await projectContext(session.token)}`,
    prompt: definition.prompt(parsed.data as never),
    history: definition.history?.(parsed.data as never),
    maxTokens: definition.maxTokens,
  });

  if (!result.ok) {
    const response = failureResponse(result.failure);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }

  return NextResponse.json({ task, text: result.text, usage: result.usage }, { headers });
}
