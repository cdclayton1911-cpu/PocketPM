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

/** Days between two YYYY-MM-DD dates; null when either is missing or unparseable. */
export function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
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
  planned_start?: string;
  planned_finish?: string;
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
  /** Positive means later than baseline, i.e. slipped. */
  start_variance_days: number | null;
  finish_variance_days: number | null;
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
  return row.actual_start || row.planned_start || null;
}
function currentFinish(row: CurrentRow): string | null {
  return row.actual_finish || row.forecast_finish || row.planned_finish || null;
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
      start_variance_days: b.start && cs ? daysBetween(b.start, cs) : null,
      finish_variance_days: b.finish && cf ? daysBetween(b.finish, cf) : null,
    });
  }

  const addedSinceBaseline = current
    .filter((c) => !baselineIds.has(c.activity_id))
    .map((c) => c.activity_id);

  return { rows, missingFromCurrent, addedSinceBaseline };
}

/** Rows that finish later than baseline, worst first. */
export function slippedActivities(report: VarianceReport, thresholdDays = 0): VarianceRow[] {
  return report.rows
    .filter((r) => r.finish_variance_days !== null && r.finish_variance_days > thresholdDays)
    .sort((a, b) => (b.finish_variance_days ?? 0) - (a.finish_variance_days ?? 0));
}
