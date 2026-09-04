import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActiveProjectId } from "@/lib/active-project";
import { logSelection } from "@/lib/retrieval/instrument";
import { selectRevisions, type RevisionQuery } from "@/lib/retrieval/select";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { DOCUMENT_REVISION_STATUS } from "@/types";

/**
 * Stage 1 document retrieval: `GET /api/retrieval/revisions`.
 *
 * Metadata selection over document_revisions, scoped to the active project and
 * read as the signed-in user, so PocketBase's rules are the access control.
 *
 * This returns *which documents match*, not answers about their contents.
 * Reading them is stage 2, which is blocked on the Files API privacy question
 * in docs/document-privacy.md.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** A strict allow-list. Anything unrecognised is refused, not ignored. */
const querySchema = z.strictObject({
  parent_type: z.enum(["submittal", "rfi"]).optional(),
  parent_id: z.string().trim().max(20).optional(),
  status: z.enum(DOCUMENT_REVISION_STATUS).optional(),
  current_only: z.enum(["true", "false"]).optional(),
  with_file_only: z.enum(["true", "false"]).optional(),
  spec_section: z.string().trim().max(40).optional(),
  drawing: z.string().trim().max(120).optional(),
  issued_from: isoDate.optional(),
  issued_to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json({ items: [], selected: 0, total: 0 });
  }

  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }
  const q = parsed.data;

  const query: RevisionQuery = {
    parentType: q.parent_type,
    parentId: q.parent_id,
    status: q.status,
    currentOnly: q.current_only === "true",
    withFileOnly: q.with_file_only === "true",
    specSection: q.spec_section,
    drawing: q.drawing,
    issuedFrom: q.issued_from,
    issuedTo: q.issued_to,
    limit: q.limit,
  };

  try {
    const result = await selectRevisions(session.token, projectId, query);

    // Instrumentation is the point of this endpoint existing before stage 2.
    logSelection(projectId, result);

    return NextResponse.json({
      items: result.items,
      selected: result.selected,
      total: result.total,
      filters_used: result.filtersUsed,
      within_stage_two_limit: result.withinStageTwoLimit,
    });
  } catch (error) {
    console.error("[retrieval.stage1] failed:", error);
    return NextResponse.json({ errors: { form: "Could not run that search" } }, { status: 502 });
  }
}
