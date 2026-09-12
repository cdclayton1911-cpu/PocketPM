/**
 * Where our computed dates disagree with the imported schedule, by how much,
 * and why.
 *
 * ## Every difference carries a cause
 *
 * A difference is only useful if it says why, so every row that differs gets
 * one:
 *
 *   - `actual_progress`: pinned by actual dates, so a difference is expected.
 *   - `constraint_not_applied`: the source schedule holds a constraint
 *     (start-on, finish-on-or-before, mandatory dates...) that the CPM pass
 *     carries but does not apply. Only as-late-as-possible is applied.
 *   - `unexplained`: none of the above. These are the ones worth investigating:
 *     a missing or wrong relationship, a calendar mismatch, or an engine bug.
 *     The XER importer's acceptance test counts them, and the target is zero.
 *
 * Level-of-effort activities are left out of the pass, so there is nothing to
 * compare. They are listed in `excluded`: not as rows, and not as unmatched.
 *
 * ## likely_constrained
 *
 * A LATER imported date was the only signal for a constraint when schedules
 * arrived without constraint fields, and a CSV still does. The flag is kept for
 * those; when the constraint is actually known, `cause` is the better answer.
 *
 * ## Deltas are CALENDAR days
 *
 * This compares two dates and asks how far apart they are. That is a calendar
 * question — the same reasoning that keeps `daysBetween` calendar-based. Floats
 * and durations remain working days, and the typed-units shape is what stops
 * the two being read as the same number.
 */

import { daysBetween } from "./variance";
import { calendarDays, type Days } from "./units";
import type { CpmResult } from "./cpm";

export type DivergenceMagnitude = "none" | "minor" | "notable" | "severe";

export type DivergenceCause = "actual_progress" | "constraint_not_applied" | "unexplained";

export const DIVERGENCE_CAUSES: readonly DivergenceCause[] = [
  "actual_progress",
  "constraint_not_applied",
  "unexplained",
];

export interface DivergenceRow {
  id: string;
  activity_id: string;
  activity: string;
  imported_start: string | null;
  imported_finish: string | null;
  computed_start: string | null;
  computed_finish: string | null;
  /**
   * Positive means the IMPORTED date is later than the computed one — P6 is
   * holding the activity back, which is what a constraint looks like from
   * here. Negative means our logic is more restrictive than the source, which
   * usually means a missing or wrong relationship rather than a constraint.
   */
  start_delta: Days | null;
  finish_delta: Days | null;
  magnitude: DivergenceMagnitude;
  /** Why it differs; null when it does not. */
  cause: DivergenceCause | null;
  /** The source schedule's constraint type, when it has one. */
  constraint_type: string | null;
  /** The imported date is materially LATER than logic allows. */
  likely_constrained: boolean;
  /** Pinned by actual progress, so a divergence here is expected, not suspicious. */
  pinned: boolean;
}

export interface DivergenceReport {
  rows: DivergenceRow[];
  /** Rows whose imported date is later than logic allows, worst first. */
  likelyConstrained: DivergenceRow[];
  /** Rows that differ with no known cause, worst first. The number to drive to zero. */
  unexplained: DivergenceRow[];
  /** Activities present in the schedule but absent from the CPM result. */
  unmatched: string[];
  /** Level-of-effort activities: left out of the pass, so not compared. */
  excluded: string[];
  counts: Record<DivergenceMagnitude, number>;
  causes: Record<DivergenceCause, number>;
  /**
   * Activities with no source early dates to compare against — a CSV without
   * an Early Start column, say. Counted, because a row with nothing to compare
   * shows no divergence, and "no divergence" read at face value is wrong.
   */
  missingSourceDates: number;
}

export interface DivergenceThresholds {
  minor: number;
  notable: number;
  severe: number;
}

/**
 * Default bands, in calendar days.
 *
 * A day or two is ordinary — a weekend boundary or an off-by-one in how the
 * source counts a finish. Ten days or more on a schedule is a different kind
 * of statement.
 */
export const DEFAULT_THRESHOLDS: DivergenceThresholds = { minor: 1, notable: 3, severe: 10 };

function magnitudeOf(delta: number, t: DivergenceThresholds): DivergenceMagnitude {
  const size = Math.abs(delta);
  if (size < t.minor) return "none";
  if (size < t.notable) return "minor";
  if (size < t.severe) return "notable";
  return "severe";
}

function causeOf(
  magnitude: DivergenceMagnitude,
  pinned: boolean,
  constraintType: string | null,
): DivergenceCause | null {
  if (magnitude === "none") return null;
  if (pinned) return "actual_progress";
  // ALAP is applied, so it explains nothing: an ALAP activity that still
  // differs is unexplained.
  if (constraintType && constraintType !== "as_late_as_possible") return "constraint_not_applied";
  return "unexplained";
}

export interface DivergenceInput {
  id: string;
  activity_id?: string;
  activity?: string;
  source_early_start?: string;
  source_early_finish?: string;
  constraint_type?: string;
}

const worstFirst = (a: DivergenceRow, b: DivergenceRow) =>
  Math.max(Math.abs(b.start_delta?.value ?? 0), Math.abs(b.finish_delta?.value ?? 0)) -
  Math.max(Math.abs(a.start_delta?.value ?? 0), Math.abs(a.finish_delta?.value ?? 0));

export function computeDivergence(
  items: readonly DivergenceInput[],
  results: readonly CpmResult[],
  thresholds: DivergenceThresholds = DEFAULT_THRESHOLDS,
): DivergenceReport {
  const byId = new Map(results.map((r) => [r.id, r]));
  const rows: DivergenceRow[] = [];
  const unmatched: string[] = [];
  const excluded: string[] = [];

  for (const item of items) {
    const result = byId.get(item.id);
    if (!result) {
      // Reported, never dropped — the same reasoning as computeVariance's
      // missingFromCurrent. An activity absent from a report reads as "no
      // divergence", which is the most misleading answer available.
      unmatched.push(item.activity_id || item.id);
      continue;
    }
    if (result.excluded) {
      excluded.push(item.activity_id || item.id);
      continue;
    }

    const startDelta =
      item.source_early_start && result.early_start
        ? daysBetween(result.early_start, item.source_early_start)
        : null;
    const finishDelta =
      item.source_early_finish && result.early_finish
        ? daysBetween(result.early_finish, item.source_early_finish)
        : null;

    // The worse of the two drives the banding: an activity whose start agrees
    // but whose finish is a fortnight out is not a minor divergence.
    const worst = Math.max(Math.abs(startDelta?.value ?? 0), Math.abs(finishDelta?.value ?? 0));
    const magnitude = startDelta || finishDelta ? magnitudeOf(worst, thresholds) : "none";

    const pinned = result.pinned_start || result.pinned_finish;
    const constraintType = item.constraint_type || null;

    rows.push({
      id: item.id,
      activity_id: item.activity_id || item.id,
      activity: item.activity || item.activity_id || item.id,
      imported_start: item.source_early_start || null,
      imported_finish: item.source_early_finish || null,
      computed_start: result.early_start,
      computed_finish: result.early_finish,
      start_delta: startDelta,
      finish_delta: finishDelta,
      magnitude,
      cause: causeOf(magnitude, pinned, constraintType),
      constraint_type: constraintType,
      // Only a LATER imported date suggests a constraint. An earlier one means
      // our logic is more restrictive than the source, which is a different
      // problem — usually a missing relationship.
      likely_constrained:
        !pinned && magnitude !== "none" && (startDelta?.value ?? 0) >= thresholds.minor,
      pinned,
    });
  }

  const counts: Record<DivergenceMagnitude, number> = { none: 0, minor: 0, notable: 0, severe: 0 };
  const causes: Record<DivergenceCause, number> = {
    actual_progress: 0,
    constraint_not_applied: 0,
    unexplained: 0,
  };
  for (const row of rows) {
    counts[row.magnitude] += 1;
    if (row.cause) causes[row.cause] += 1;
  }

  return {
    rows,
    missingSourceDates: items.filter((i) => !i.source_early_start && !i.source_early_finish).length,
    likelyConstrained: rows
      .filter((r) => r.likely_constrained)
      .sort((a, b) => (b.start_delta?.value ?? 0) - (a.start_delta?.value ?? 0)),
    unexplained: rows.filter((r) => r.cause === "unexplained").sort(worstFirst),
    unmatched,
    excluded,
    counts,
    causes,
  };
}

/** Deltas are calendar days; floats are working days. Never the same number. */
export function divergenceBasis(): Days {
  return calendarDays(0);
}
