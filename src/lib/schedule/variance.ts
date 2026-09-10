/**
 * Baseline variance: what was planned against what is happening.
 *
 * Pure, no I/O. The join is on `activity_id` — the P6 activity code — because a
 * baseline has to survive the re-import that replaces `schedule_items`, so it
 * cannot hold relations to activities that are about to be deleted.
 *
 * The consequence of joining on a business key is that a renamed or renumbered
 * activity will not match. That is reported, never dropped: an activity missing
 * from a variance report reads as "no variance", which is the most misleading
 * possible answer on a schedule claim.
 */

import { calendarDays, compareDays, type Days } from "./units";

/**
 * CALENDAR days between two YYYY-MM-DD dates; null when either is missing or
 * unparseable.
 *
 * The arithmetic is deliberately unchanged and deliberately calendar-based:
 * contract time is calendar time, and liquidated damages accrue on Sundays.
 * What changed is that the answer now carries its unit, so it cannot be
 * rendered beside a working-day duration as though the two were comparable.
 */
export function daysBetween(from: string, to: string): Days | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return calendarDays(Math.round((b - a) / 86_400_000));
}

export interface BaselineRow {
  activity_id: string;
  activity?: string;
  start?: string;
  finish?: string;
}

export interface CurrentRow {
  activity_id: string;
  activity?: string;
  /** Actual dates win over planned when present — that is what "current" means. */
  target_start?: string;
  target_finish?: string;
  actual_start?: string;
  actual_finish?: string;
  forecast_finish?: string;
}

export interface VarianceRow {
  activity_id: string;
  activity: string;
  baseline_start: string | null;
  baseline_finish: string | null;
  current_start: string | null;
  current_finish: string | null;
  /**
   * Positive means later than baseline, i.e. slipped.
   *
   * Carries its basis. A consumer that wants to compare these against a
   * working-day duration has to notice the mismatch instead of subtracting one
   * from the other and getting a number that looks fine.
   */
  start_variance: Days | null;
  finish_variance: Days | null;
}

export interface VarianceReport {
  rows: VarianceRow[];
  /** In the baseline but not in the current schedule — deleted or renumbered. */
  missingFromCurrent: string[];
  /** In the current schedule but not baselined — added since. */
  addedSinceBaseline: string[];
}

/** The date a row is actually working to: actual, else forecast, else planned. */
function currentStart(row: CurrentRow): string | null {
  return row.actual_start || row.target_start || null;
}
function currentFinish(row: CurrentRow): string | null {
  return row.actual_finish || row.forecast_finish || row.target_finish || null;
}

export function computeVariance(
  baseline: readonly BaselineRow[],
  current: readonly CurrentRow[],
): VarianceReport {
  const currentById = new Map(current.map((r) => [r.activity_id, r]));
  const baselineIds = new Set(baseline.map((r) => r.activity_id));

  const rows: VarianceRow[] = [];
  const missingFromCurrent: string[] = [];

  for (const b of baseline) {
    const c = currentById.get(b.activity_id);
    if (!c) {
      missingFromCurrent.push(b.activity_id);
      continue;
    }
    const cs = currentStart(c);
    const cf = currentFinish(c);
    rows.push({
      activity_id: b.activity_id,
      activity: c.activity || b.activity || b.activity_id,
      baseline_start: b.start || null,
      baseline_finish: b.finish || null,
      current_start: cs,
      current_finish: cf,
      start_variance: b.start && cs ? daysBetween(b.start, cs) : null,
      finish_variance: b.finish && cf ? daysBetween(b.finish, cf) : null,
    });
  }

  const addedSinceBaseline = current
    .filter((c) => !baselineIds.has(c.activity_id))
    .map((c) => c.activity_id);

  return { rows, missingFromCurrent, addedSinceBaseline };
}

/**
 * Rows that finish later than baseline, worst first.
 *
 * The threshold is a Days value, not a bare number, so a caller cannot pass a
 * working-day figure and silently filter calendar-day variances against it.
 */
export function slippedActivities(
  report: VarianceReport,
  threshold: Days = calendarDays(0),
): VarianceRow[] {
  return report.rows
    .filter((r) => {
      if (!r.finish_variance) return false;
      const diff = compareDays(r.finish_variance, threshold);
      return diff !== null && diff > 0;
    })
    .sort((a, b) => (b.finish_variance?.value ?? 0) - (a.finish_variance?.value ?? 0));
}
