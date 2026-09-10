/**
 * The dry run. Nothing here writes.
 *
 * This is the deliverable, not a confirmation step: an import REPLACES
 * `schedule_items`, and the most damaging thing it can do is not visible in the
 * schedule at all.
 *
 * ## The baseline-match report
 *
 * `schedule_baseline_items` join to activities by `activity_id` STRING, not by
 * relation — deliberately, so a baseline survives the re-import that deletes
 * and recreates every activity (docs/schedule-plan.md). The cost is that a
 * changed or missing activity id silently detaches baseline items from the
 * schedule, and `computeVariance` then reports them as `missingFromCurrent`.
 *
 * A baseline that matches nothing reports no variance. On a delay claim that
 * is the most misleading answer available, and it is invisible: the schedule
 * looks fine, the baseline still exists, and the variance report is simply
 * empty. So the count is computed BEFORE the write and shown to the user, who
 * has to acknowledge it.
 */

import { topologicalOrder } from "@/lib/schedule/graph";
import type { MappedActivity, RowProblem } from "./mapping";

export interface BaselineMatch {
  baselineId: string;
  baselineName: string;
  totalItems: number;
  willMatch: number;
  willOrphan: number;
  /** A sample of the ids that stop matching, for the confirmation dialog. */
  orphanedSample: string[];
}

export interface DryRunReport {
  encoding: string;
  encodingGuessed: boolean;
  delimiter: string;
  headers: string[];
  unmapped: string[];
  sample: MappedActivity[];
  problems: RowProblem[];
  counts: {
    activities: number;
    relationships: number;
    skipped: number;
    errors: number;
    warnings: number;
  };
  /** Predecessor references naming an activity the file does not contain. */
  danglingPredecessors: { rowNumber: number; activity_id: string; reference: string }[];
  duplicateActivityIds: { activity_id: string; rowNumbers: number[] }[];
  baselines: BaselineMatch[];
  /** Non-null when the imported logic would form a cycle. */
  cycle: string | null;
  canImport: boolean;
  /**
   * Why the import is refused, in one sentence. Non-null whenever canImport is
   * false. A refusal with no stated reason is how the page came to say "fix
   * the errors above" over an empty space.
   */
  refusal: string | null;
}

export interface ExistingBaseline {
  id: string;
  name: string;
  itemActivityIds: string[];
}

export interface DryRunInput {
  encoding: string;
  encodingGuessed: boolean;
  delimiter: string;
  headers: string[];
  unmapped: string[];
  activities: MappedActivity[];
  problems: RowProblem[];
  skipped: number;
  baselines: ExistingBaseline[];
  sampleSize?: number;
  /**
   * Problems with the FILE rather than a row — e.g. it is a P6 XER export, not
   * an activity table. Listed first: they explain a refusal no row can.
   */
  fileProblems?: RowProblem[];
  /**
   * False when no column is mapped to activity_id. Every row then fails for
   * the same reason, so one file-level message replaces a copy per row.
   */
  activityIdMapped?: boolean;
}

export function buildDryRun(input: DryRunInput): DryRunReport {
  const { activities } = input;
  const fileProblems = [...(input.fileProblems ?? [])];
  let rowProblems = [...input.problems];

  // No column on activity_id: every row fails identically. One message naming
  // the cause is the reason; a copy per row buries it.
  if (input.activityIdMapped === false && rowProblems.some((p) => p.field === "activity_id")) {
    rowProblems = rowProblems.filter((p) => !(p.field === "activity_id" && p.rowNumber > 0));
    fileProblems.push({
      rowNumber: 0,
      field: "activity_id",
      severity: "error",
      message:
        "No column is mapped to activity_id, so no row can be imported. Choose the column that holds each activity's ID.",
    });
  }

  const problems = [...fileProblems, ...rowProblems];

  // Duplicates within the file. A repeated id makes "which activity is this"
  // unanswerable, and the unique-per-baseline join would pick arbitrarily.
  const seen = new Map<string, number[]>();
  for (const a of activities) {
    const list = seen.get(a.activity_id);
    if (list) list.push(a.rowNumber);
    else seen.set(a.activity_id, [a.rowNumber]);
  }
  const duplicateActivityIds = [...seen.entries()]
    .filter(([, rowNumbers]) => rowNumbers.length > 1)
    .map(([activity_id, rowNumbers]) => ({ activity_id, rowNumbers }));

  for (const dup of duplicateActivityIds) {
    problems.push({
      rowNumber: dup.rowNumbers[1],
      field: "activity_id",
      severity: "error",
      message: `Activity ID "${dup.activity_id}" appears on rows ${dup.rowNumbers.join(", ")}. IDs must be unique.`,
    });
  }

  const present = new Set(activities.map((a) => a.activity_id));

  const danglingPredecessors: DryRunReport["danglingPredecessors"] = [];
  let relationships = 0;
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (p.problem) continue;
      if (!present.has(p.activity_id)) {
        danglingPredecessors.push({
          rowNumber: a.rowNumber,
          activity_id: a.activity_id,
          reference: p.activity_id,
        });
        continue;
      }
      relationships += 1;
    }
  }
  for (const d of danglingPredecessors) {
    problems.push({
      rowNumber: d.rowNumber,
      field: "predecessors",
      severity: "error",
      message: `"${d.reference}" is not an activity in this file, so the dependency cannot be created.`,
    });
  }

  // Cycles are refused here, before any write. Discovering one at write time
  // would leave a half-imported schedule and a 500.
  const edges = activities.flatMap((a) =>
    a.predecessors
      .filter((p) => !p.problem && present.has(p.activity_id))
      .map((p) => ({ predecessor: p.activity_id, successor: a.activity_id })),
  );
  const order = topologicalOrder([...present], edges);
  const cycle = order === null ? "The imported dependencies form a loop, so no schedule can be calculated from them." : null;
  if (cycle) {
    problems.push({ rowNumber: 0, severity: "error", message: cycle });
  }

  const baselines: BaselineMatch[] = input.baselines.map((b) => {
    const matching = b.itemActivityIds.filter((id) => present.has(id));
    const orphaned = b.itemActivityIds.filter((id) => !present.has(id));
    return {
      baselineId: b.id,
      baselineName: b.name,
      totalItems: b.itemActivityIds.length,
      willMatch: matching.length,
      willOrphan: orphaned.length,
      orphanedSample: orphaned.slice(0, 10),
    };
  });

  // Nothing read and nothing said why. Without this, canImport is false with
  // an empty problem list — "fix the errors above" over nothing.
  const totalRows = activities.length + input.skipped;
  if (activities.length === 0 && !problems.some((p) => p.severity === "error")) {
    problems.push({
      rowNumber: 0,
      severity: "error",
      message:
        totalRows === 0
          ? "The file has a header row but no rows beneath it, so there is nothing to import."
          : "No activities were read from this file, so there is nothing to import.",
    });
  }

  // File-level problems first: they are the explanation, and a long list of
  // row errors must not push them out of view.
  problems.sort((a, b) => (a.rowNumber === 0 ? 0 : 1) - (b.rowNumber === 0 ? 0 : 1));

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const canImport = errors === 0 && activities.length > 0;

  return {
    encoding: input.encoding,
    encodingGuessed: input.encodingGuessed,
    delimiter: input.delimiter,
    headers: input.headers,
    unmapped: input.unmapped,
    sample: activities.slice(0, input.sampleSize ?? 10),
    problems,
    counts: { activities: activities.length, relationships, skipped: input.skipped, errors, warnings },
    danglingPredecessors,
    duplicateActivityIds,
    baselines,
    cycle,
    // Warnings do not block. Errors do — importing a file with known-bad rows
    // would put exactly the wrong data behind a schedule that looks imported.
    canImport,
    refusal: canImport ? null : refusalFor(problems, errors),
  };
}

/**
 * One sentence saying why an import is refused.
 *
 * A file-level error is the reason when there is one. Otherwise it is the row
 * errors, counted, with the first quoted, so the sentence stays useful when
 * the list is long.
 */
function refusalFor(problems: RowProblem[], errors: number): string {
  const fileError = problems.find((p) => p.rowNumber === 0 && p.severity === "error");
  if (fileError) return fileError.message;
  const first = problems.find((p) => p.severity === "error");
  return (
    `${errors} row${errors === 1 ? " has an error" : "s have errors"}, listed above` +
    (first ? ` — the first: \u201c${first.message}\u201d` : "") +
    ". Fix them in the file or remap the columns."
  );
}

/** True when any baseline loses items, which the user must acknowledge. */
export function orphansBaselineItems(report: DryRunReport): boolean {
  return report.baselines.some((b) => b.willOrphan > 0);
}
