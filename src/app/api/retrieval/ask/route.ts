import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActiveProjectId } from "@/lib/active-project";
import { complete } from "@/lib/ai/anthropic";
import { AI_TASKS, BASE_SYSTEM } from "@/lib/ai/tasks";
import { logSelection } from "@/lib/retrieval/instrument";
import { selectRevisions, type SelectedRevision } from "@/lib/retrieval/select";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { DOCUMENT_REVISION_STATUS } from "@/types";

/**
 * Metadata-only stage 2: `POST /api/retrieval/ask`.
 *
 * Runs stage-1 selection, renders the matching revisions as a table, and asks
 * Claude a status/chronology question about that table.
 *
 * ## What is sent to Anthropic, precisely
 *
 * **No file contents.** Not the PDF, not extracted text, not a page image. The
 * Files API is not used and nothing is uploaded.
 *
 * **But metadata is not nothing.** The table below carries parent identifiers
 * and titles — "RFI 017 — Beam/duct conflict at grid C" — plus spec sections,
 * statuses, and dates. A title can be disclosive. This is the same kind of
 * disclosure the other AI modules already make with project name and contract
 * value, at larger volume.
 *
 * `renderTable` is the single place that decides what crosses the boundary.
 * Narrowing it to identifiers only (dropping `parent_label` and `spec_section`)
 * is a one-line change if the policy answer calls for it — the cost is that
 * answers become "Rev 1 of 05120-001" with no indication of what that covers.
 *
 * See docs/document-privacy.md.
 */

const bodySchema = z.strictObject({
  question: z.string().trim().min(1, "Ask a question").max(2000),
  filters: z
    .strictObject({
      parent_type: z.enum(["submittal", "rfi"]).optional(),
      parent_id: z.string().trim().max(20).optional(),
      status: z.enum(DOCUMENT_REVISION_STATUS).optional(),
      current_only: z.boolean().optional(),
      with_file_only: z.boolean().optional(),
      spec_section: z.string().trim().max(40).optional(),
      drawing: z.string().trim().max(120).optional(),
    })
    .optional(),
});

/** Per-user AI quota, shared with /api/ai/[task]. */
const LIMIT = Number(process.env.AI_RATE_LIMIT_PER_HOUR) || 20;
const WINDOW_MS = 60 * 60 * 1000;

/** The exact set of fields that leaves this server. Nothing else is rendered. */
function renderTable(items: SelectedRevision[]): string {
  const header = "parent | parent_type | revision | status | current | issued | spec | file";
  const rows = items.map((r) =>
    [
      r.parent_label || r.parent_id,
      r.parent_type,
      `Rev ${r.revision_number}`,
      r.status,
      r.is_current ? "CURRENT" : "-",
      r.issued_at || "not issued",
      r.spec_section || "-",
      r.file ? "attached" : "MISSING",
    ].join(" | "),
  );
  return [header, ...rows].join("\n");
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  const limit = rateLimit(`ai:${session.user.id}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { errors: { form: `AI request limit reached (${LIMIT} per hour).` } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json(
      { errors: { form: "Select or create a project first" } },
      { status: 409 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const f = parsed.data.filters ?? {};
  const selection = await selectRevisions(session.token, projectId, {
    parentType: f.parent_type,
    parentId: f.parent_id,
    status: f.status,
    currentOnly: f.current_only,
    withFileOnly: f.with_file_only,
    specSection: f.spec_section,
    drawing: f.drawing,
    // The prompt has to fit; the table is the input, so this is the real cap.
    limit: 60,
  });
  logSelection(projectId, selection);

  if (selection.items.length === 0) {
    // No upstream call: there is nothing to reason about, and spending a
    // request to be told "no documents" is waste.
    return NextResponse.json({
      answer: "No revisions match those filters, so there is nothing to report on.",
      selected: 0,
      total: selection.total,
      spent_ai_call: false,
    });
  }

  const task = AI_TASKS["document-status"];
  const input = { question: parsed.data.question, documents: renderTable(selection.items) };

  const result = await complete({
    system: `${BASE_SYSTEM}\n\n${task.system}`,
    prompt: task.prompt(input as never),
    maxTokens: task.maxTokens,
  });

  if (!result.ok) {
    console.error("[retrieval.ask] upstream failure:", result.failure);
    const message =
      result.failure.kind === "not_configured"
        ? "AI is not configured on this server."
        : "The AI service did not respond. The document list above is still accurate.";
    return NextResponse.json({ errors: { form: message } }, { status: 502 });
  }

  return NextResponse.json({
    answer: result.text,
    selected: selection.selected,
    total: selection.total,
    usage: result.usage,
    spent_ai_call: true,
  });
}
