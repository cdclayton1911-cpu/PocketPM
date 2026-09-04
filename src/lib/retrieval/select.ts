// Server-only: builds PocketBase filters and reads as the signed-in user.
import "server-only";

import { createClient } from "@/lib/pocketbase";
import type { DocumentRevision, Rfi, Submittal } from "@/types";

/**
 * Stage 1 of document retrieval: narrow to a handful of revisions using
 * metadata, with SQL rather than vectors.
 *
 * Deliberately not a semantic search. See docs/rag-plan.md — Anthropic has no
 * embeddings endpoint, so vector search would mean a second AI vendor, a second
 * processor for confidential documents, and an index outside PocketBase with no
 * project rules on it. The fields below are what `document_revisions` and its
 * parents already carry, and every query runs through the same project-scoped
 * rules that `npm run verify:tenancy` guards.
 *
 * Stage 2 — attaching the selected PDFs and answering with citations — is NOT
 * built. It requires uploading documents to the Files API, which takes them off
 * the droplet, and that is an unanswered policy question. See
 * docs/document-privacy.md.
 */

export interface RevisionQuery {
  /** Restrict to one kind of parent. Omit for both. */
  parentType?: "submittal" | "rfi";
  /** A specific submittal or RFI id. */
  parentId?: string;
  /** Revision lifecycle status. */
  status?: string;
  /** Only the revision currently in force for its parent. */
  currentOnly?: boolean;
  /** Only revisions that actually have a document attached. */
  withFileOnly?: boolean;
  /** CSI spec section, matched on the parent record. */
  specSection?: string;
  /** Drawing reference — RFIs only. */
  drawing?: string;
  /** Inclusive `issued_at` bounds, YYYY-MM-DD. */
  issuedFrom?: string;
  issuedTo?: string;
  /** Hard cap on rows returned. */
  limit?: number;
}

/** A revision with enough parent context to be useful without a second fetch. */
export interface SelectedRevision {
  id: string;
  revision_number: number;
  status: string;
  is_current: boolean;
  issued_at: string;
  file: string;
  parent_type: "submittal" | "rfi" | "unknown";
  parent_id: string;
  parent_label: string;
  spec_section: string;
}

export interface SelectionResult {
  items: SelectedRevision[];
  /** Rows matching the filters. */
  selected: number;
  /** Every revision in the project — the denominator for selectivity. */
  total: number;
  /** Which filters were actually applied. */
  filtersUsed: string[];
  /** False when the result set is too large for stage 2 to read. */
  withinStageTwoLimit: boolean;
  ms: number;
}

/**
 * How many documents stage 2 could plausibly attach to one request.
 *
 * The API's hard ceilings are 32 MB and 600 pages per request; this is a
 * deliberately conservative document count standing in for both, since page
 * counts are not known without opening each PDF. Its purpose is to answer one
 * question over time: **how often does metadata alone fail to narrow enough?**
 * That number is what should decide whether embeddings are ever needed.
 */
export const STAGE_TWO_DOC_LIMIT = 20;

const DEFAULT_LIMIT = 100;

type ExpandedRevision = DocumentRevision & {
  expand?: { submittal?: Submittal; rfi?: Rfi };
};

function parentOf(rec: ExpandedRevision): {
  type: SelectedRevision["parent_type"];
  id: string;
  label: string;
  spec: string;
} {
  const sub = rec.expand?.submittal;
  if (sub) {
    return {
      type: "submittal",
      id: sub.id,
      label: `${sub.submittal_number} — ${sub.description}`.trim(),
      spec: sub.spec_section ?? "",
    };
  }
  const rfi = rec.expand?.rfi;
  if (rfi) {
    return {
      type: "rfi",
      id: rfi.id,
      label: `RFI ${rfi.rfi_number} — ${rfi.subject}`.trim(),
      spec: rfi.spec_section ?? "",
    };
  }
  // The parent exists but the user cannot view it, or it was removed. Reported
  // rather than hidden: a revision whose parent is unreadable is a real state,
  // and silently dropping it would misreport selectivity.
  return { type: "unknown", id: rec.submittal || rec.rfi || "", label: "(parent unavailable)", spec: "" };
}

export async function selectRevisions(
  token: string,
  projectId: string,
  query: RevisionQuery,
): Promise<SelectionResult> {
  const started = Date.now();
  const pb = createClient(token);

  // The project clause is always first and is never replaced — narrowing
  // filters are added to it, exactly as in lib/crud-route.ts.
  const clauses = [pb.filter("project = {:project}", { project: projectId })];
  const filtersUsed: string[] = [];

  const add = (name: string, expr: string, params: Record<string, unknown>) => {
    clauses.push(pb.filter(expr, params));
    filtersUsed.push(name);
  };

  if (query.parentType === "submittal") add("parentType", 'submittal != ""', {});
  if (query.parentType === "rfi") add("parentType", 'rfi != ""', {});

  if (query.parentId) {
    // Matches whichever relation holds it; the other is empty on any given row.
    add("parentId", "(submittal = {:p} || rfi = {:p})", { p: query.parentId });
  }
  if (query.status) add("status", "status = {:s}", { s: query.status });
  if (query.currentOnly) add("currentOnly", "is_current = true", {});
  if (query.withFileOnly) add("withFileOnly", 'file != ""', {});

  if (query.specSection) {
    // spec_section lives on the parent, and both parent types have one, so the
    // clause has to reach through whichever relation is set.
    add("specSection", "(submittal.spec_section = {:v} || rfi.spec_section = {:v})", {
      v: query.specSection,
    });
  }
  if (query.drawing) add("drawing", "rfi.drawing ~ {:v}", { v: query.drawing });

  // Dates are text fields in this schema (see docs/schema-notes.md), but
  // YYYY-MM-DD sorts and compares correctly as a string, so range filters work.
  if (query.issuedFrom) add("issuedFrom", "issued_at >= {:d}", { d: query.issuedFrom });
  if (query.issuedTo) add("issuedTo", "issued_at <= {:d}", { d: query.issuedTo });

  const [rows, all] = await Promise.all([
    pb.collection("document_revisions").getList<ExpandedRevision>(1, query.limit ?? DEFAULT_LIMIT, {
      filter: clauses.join(" && "),
      sort: "-issued_at,revision_number",
      expand: "submittal,rfi",
    }),
    // Denominator for selectivity. Cheap: perPage 1, only the count is read.
    pb.collection("document_revisions").getList(1, 1, {
      filter: pb.filter("project = {:project}", { project: projectId }),
    }),
  ]);

  const items = rows.items.map((rec): SelectedRevision => {
    const parent = parentOf(rec);
    return {
      id: rec.id,
      revision_number: rec.revision_number,
      status: rec.status,
      is_current: rec.is_current,
      issued_at: rec.issued_at,
      file: rec.file,
      parent_type: parent.type,
      parent_id: parent.id,
      parent_label: parent.label,
      spec_section: parent.spec,
    };
  });

  return {
    items,
    selected: rows.totalItems,
    total: all.totalItems,
    filtersUsed,
    withinStageTwoLimit: rows.totalItems > 0 && rows.totalItems <= STAGE_TWO_DOC_LIMIT,
    ms: Date.now() - started,
  };
}
