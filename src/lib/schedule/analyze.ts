// Server-only: loads a project's schedule and runs the pure engine over it.
import "server-only";

import type PocketBase from "pocketbase";

import { normalizeCalendar, type ProjectCalendar } from "./calendar";
import { computeCpm, type CpmActivity, type CpmRelationship, type CpmOutcome } from "./cpm";
import { computeDivergence, type DivergenceReport } from "./divergence";

export interface ScheduleAnalysis {
  outcome: CpmOutcome;
  divergence: DivergenceReport | null;
  calendar: ProjectCalendar;
  itemCount: number;
}

/**
 * Compute CPM and divergence for one project, as the calling user.
 *
 * Computed FRESH on every read rather than served from the stored fields.
 * docs/schedule-plan.md's reasoning still holds — a stored critical path drifts
 * the moment someone edits a duration — so the columns on schedule_items are a
 * cache for list views, and anything a PM actually looks at is recomputed.
 */
export async function analyzeSchedule(pb: PocketBase, projectId: string): Promise<ScheduleAnalysis> {
  const project = await pb.collection("projects").getOne(projectId);
  const calendar = normalizeCalendar({
    work_days: project.work_days as number[] | undefined,
    holidays: project.holidays as { date: string; label?: string }[] | undefined,
  });

  const items = await pb.collection("schedule_items").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
    sort: "sort_order",
  });
  const relationships = await pb.collection("schedule_relationships").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
  });

  const activities: CpmActivity[] = items.map((i) => ({
    id: i.id,
    duration_days: i.duration_days as number,
    planned_start: i.planned_start as string,
    planned_finish: i.planned_finish as string,
    actual_start: i.actual_start as string,
    actual_finish: i.actual_finish as string,
    is_milestone: Boolean(i.is_milestone),
  }));

  const rels: CpmRelationship[] = relationships.map((r) => ({
    predecessor: r.predecessor as string,
    successor: r.successor as string,
    type: r.type as CpmRelationship["type"],
    lag_days: r.lag_days as number,
  }));

  const outcome = computeCpm(activities, rels, calendar, {
    projectStart: (project.start_date as string) || undefined,
  });

  const divergence = outcome.ok
    ? computeDivergence(
        items.map((i) => ({
          id: i.id,
          activity_id: i.activity_id as string,
          activity: i.activity as string,
          planned_start: i.planned_start as string,
          planned_finish: i.planned_finish as string,
        })),
        outcome.report.activities,
      )
    : null;

  return { outcome, divergence, calendar, itemCount: items.length };
}

/**
 * Write the computed results into the cache columns.
 *
 * Explicit: nothing calls this on read. The stored values are stale the moment
 * a duration changes, which is exactly why the screens do not read them.
 */
export async function persistCpm(pb: PocketBase, analysis: ScheduleAnalysis): Promise<number> {
  if (!analysis.outcome.ok) return 0;
  let written = 0;
  for (const row of analysis.outcome.report.activities) {
    await pb.collection("schedule_items").update(row.id, {
      early_start: row.early_start ?? "",
      early_finish: row.early_finish ?? "",
      late_start: row.late_start ?? "",
      late_finish: row.late_finish ?? "",
      // Working days — the basis lives in the type layer, not the column.
      total_float: row.total_float?.value ?? null,
      free_float: row.free_float?.value ?? null,
      is_critical: row.is_critical,
    });
    written += 1;
  }
  return written;
}
