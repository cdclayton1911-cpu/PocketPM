// Server-only: writes to the process log, never to a response.
import "server-only";

import { STAGE_TWO_DOC_LIMIT, type SelectionResult } from "@/lib/retrieval/select";

/**
 * Record how well metadata filtering narrowed a real query.
 *
 * This exists to answer one question with data instead of intuition: **how
 * often does stage 1 fail to narrow enough for stage 2 to read the result?**
 * If that is rare, embeddings are never needed and the second AI vendor, second
 * data processor, and un-ruled vector index are all avoided. If it is common,
 * these lines are the evidence that justifies them. See docs/rag-plan.md.
 *
 * ## What is deliberately NOT logged
 *
 * No question text, no document filenames, no parent titles, no spec sections.
 * A construction document's *subject* is often the confidential part — "RFI on
 * the fireproofing deficiency at grid C" tells a reader plenty. Journald is
 * readable by anyone with shell access on the droplet and is shipped nowhere
 * with a retention policy, so it gets shape only: which filter names were used,
 * how many rows matched, and out of how many.
 *
 * The project id is included because selectivity is meaningless without knowing
 * whether two lines describe the same corpus. It is an opaque 15-character id,
 * not a name.
 */

/** Stable prefix so these can be extracted from mixed journald output. */
const TAG = "[retrieval.stage1]";

export function logSelection(projectId: string, result: SelectionResult): void {
  const line = {
    project: projectId,
    filters: result.filtersUsed,
    filter_count: result.filtersUsed.length,
    selected: result.selected,
    total: result.total,
    // The headline metric: 1.0 means the filters excluded nothing.
    selectivity: result.total > 0 ? Number((result.selected / result.total).toFixed(3)) : null,
    within_limit: result.withinStageTwoLimit,
    limit: STAGE_TWO_DOC_LIMIT,
    ms: result.ms,
  };
  // One line, one JSON object — greppable and jq-able. See docs/rag-plan.md
  // for the aggregation command.
  console.log(`${TAG} ${JSON.stringify(line)}`);
}
