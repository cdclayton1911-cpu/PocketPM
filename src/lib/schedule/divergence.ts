/**
 * Where our computed dates disagree with the imported schedule, and by how much.
 *
 * ## Why this is a primary deliverable, not a diagnostic afterthought
 *
 * `schedule_items` carries NO constraint fields — no must-start-on, no
 * start-no-earlier-than, no deadline — and constraints are out of scope for
 * this pass. Real P6 schedules are full of them, and a constrained activity's
 * date is held by the constraint rather than derived from logic.
 *
 * So for any constrained activity our computed date will disagree with the
 * imported one. That is a correct pure-logic answer and a wrong mirror, and the
 * disagreement is not noise: **it is the only signal we have for which
 * activities are constrained**, since there is no field to read. A large
 * divergence on an otherwise unremarkable activity almost always means P6 is
 * holding a date that logic does not support.
 *
 * That makes this both a PM-facing report and our instrument for finding
 * constrained activities without a constraint field.
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
  /** The imported date is materially LATER than logic allows. */
  likely_constrained: boolean;
  /** Pinned by actual progress, so a divergence here is expected, not suspicious. */
  pinned: boolean;
}

export interface DivergenceReport {
  rows: DivergenceRow[];
  /** Rows whose imported date is later than logic allows, worst first. */
  likelyConstrained: DivergenceRow[];
  /** Activities present in the schedule but absent from the CPM result. */
  unmatched: string[];
  counts: Record<DivergenceMagnitude, number>;
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

export interface DivergenceInput {
  id: string;
  activity_id?: string;
  activity?: string;
  source_early_start?: string;
  source_early_finish?: string;
}

export function computeDivergence(
  items: readonly DivergenceInput[],
  results: readonly CpmResult[],
  thresholds: DivergenceThresholds = DEFAULT_THRESHOLDS,
): DivergenceReport {
  const byId = new Map(results.map((r) => [r.id, r]));
  const rows: DivergenceRow[] = [];
  const unmatched: string[] = [];

  for (const item of items) {
    const result = byId.get(item.id);
    if (!result) {
      // Reported, never dropped — the same reasoning as computeVariance's
      // missingFromCurrent. An activity absent from a report reads as "no
      // divergence", which is the most misleading answer available.
      unmatched.push(item.activity_id || item.id);
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
      // Only a LATER imported date suggests a constraint. An earlier one means
      // our logic is more restrictive than the source, which is a different
      // problem — usually a missing relationship.
      likely_constrained:
        !pinned && magnitude !== "none" && (startDelta?.value ?? 0) >= thresholds.minor,
      pinned,
    });
  }

  const counts: Record<DivergenceMagnitude, number> = { none: 0, minor: 0, notable: 0, severe: 0 };
  for (const row of rows) counts[row.magnitude] += 1;

  return {
    rows,
    missingSourceDates: items.filter((i) => !i.source_early_start && !i.source_early_finish).length,
    likelyConstrained: rows
      .filter((r) => r.likely_constrained)
      .sort((a, b) => (b.start_delta?.value ?? 0) - (a.start_delta?.value ?? 0)),
    unmatched,
    counts,
  };
}

/** Deltas are calendar days; floats are working days. Never the same number. */
export function divergenceBasis(): Days {
  return calendarDays(0);
}
