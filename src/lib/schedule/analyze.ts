// Server-only: loads a project's schedule and runs the pure engine over it.
import "server-only";

import type PocketBase from "pocketbase";

import { normalizeCalendar, type Holiday, type ProjectCalendar } from "./calendar";
import { computeCpm, type CpmActivity, type CpmRelationship, type CpmOutcome } from "./cpm";
import { computeDivergence, type DivergenceReport } from "./divergence";
import { cacheFreshness, type CpmInputs, type Freshness } from "./inputs-hash";

/**
 * Which calendar the pass ran on, and why. Returned with every analysis so a
 * computed date can always be traced to the calendar that produced it.
 */
export type CalendarSource =
  | {
      kind: "import";
      importId: string;
      /** The source calendar's name, as the import recorded it. */
      name: string | null;
      importedAt: string;
      hoursPerDay: number | null;
      /** e.g. activities using more than one calendar. Shown, never buried. */
      warnings: string[];
    }
  | { kind: "project" };

export interface ScheduleAnalysis {
  outcome: CpmOutcome;
  divergence: DivergenceReport | null;
  calendar: ProjectCalendar;
  calendarSource: CalendarSource;
  /** The latest import's data date; null when it has none (a CSV) or nothing was imported. */
  dataDate: string | null;
  itemCount: number;
  /**
   * Whether the persisted CPM columns still match the inputs.
   *
   * Nothing may read those columns while this says `stale` — see
   * docs/schedule-plan.md. The screens here compute fresh regardless, so this
   * exists for consumers that do not, and for telling the user their stored
   * numbers have been overtaken.
   */
  freshness: Freshness;
  computedAt: string | null;
  /** Exactly what the hash was taken over, so persistCpm cannot disagree. */
  inputs: CpmInputs;
}

function dateOnly(value: unknown): string | null {
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

/**
 * The calendar and data date for a project's schedule.
 *
 * Precedence, decided 2026-09-11: the LATEST import's calendar when it brought
 * one (a P6 import does), otherwise the project's own calendar.
 *
 * The data date comes from the latest import and nowhere else. A CSV import
 * records none, and that record is what stops an earlier P6 import's data date
 * flooring a schedule the CSV has since replaced.
 */
async function scheduleCalendar(
  pb: PocketBase,
  projectId: string,
  project: Record<string, unknown>,
): Promise<{ calendar: ProjectCalendar; calendarSource: CalendarSource; dataDate: string | null }> {
  const page = await pb.collection("schedule_imports").getList(1, 1, {
    filter: pb.filter("project = {:p}", { p: projectId }),
    sort: "-created",
  });
  const latest = page.items[0] ?? null;

  const importedWorkDays = Array.isArray(latest?.work_days) ? (latest.work_days as number[]) : [];
  if (latest && importedWorkDays.length > 0) {
    return {
      calendar: normalizeCalendar({
        work_days: importedWorkDays,
        holidays: latest.holidays as Holiday[] | undefined,
      }),
      calendarSource: {
        kind: "import",
        importId: latest.id,
        name: (latest.calendar_name as string) || null,
        importedAt: latest.created as string,
        hoursPerDay: (latest.hours_per_day as number) || null,
        warnings: stringList(latest.calendar_warnings),
      },
      dataDate: dateOnly(latest.data_date),
    };
  }

  return {
    calendar: normalizeCalendar({
      work_days: project.work_days as number[] | undefined,
      holidays: project.holidays as Holiday[] | undefined,
    }),
    calendarSource: { kind: "project" },
    dataDate: latest ? dateOnly(latest.data_date) : null,
  };
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
  const { calendar, calendarSource, dataDate } = await scheduleCalendar(pb, projectId, project);

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
    // PocketBase returns 0 for an unset number. The engine reads remaining
    // duration only with a data date, and a CSV import has none, so a CSV's
    // unset 0 is never mistaken for "no work left".
    remaining_duration_days: i.remaining_duration_days as number,
    target_start: i.target_start as string,
    target_finish: i.target_finish as string,
    actual_start: i.actual_start as string,
    actual_finish: i.actual_finish as string,
    activity_type: (i.activity_type || "task") as CpmActivity["activity_type"],
    constraint_type: (i.constraint_type as string) || undefined,
  }));

  const rels: CpmRelationship[] = relationships.map((r) => ({
    predecessor: r.predecessor as string,
    successor: r.successor as string,
    type: r.type as CpmRelationship["type"],
    lag_days: r.lag_days as number,
  }));

  const inputs: CpmInputs = {
    activities,
    relationships: rels,
    calendar,
    projectStart: (project.start_date as string) || undefined,
    dataDate,
  };

  const outcome = computeCpm(activities, rels, calendar, {
    projectStart: inputs.projectStart,
    dataDate,
  });

  const divergence = outcome.ok
    ? computeDivergence(
        items.map((i) => ({
          id: i.id,
          activity_id: i.activity_id as string,
          activity: i.activity as string,
          // The SOURCE scheduler's early dates, not the target dates: divergence
          // asks where our logic disagrees with the tool that made the schedule.
          source_early_start: i.source_early_start as string,
          source_early_finish: i.source_early_finish as string,
          constraint_type: (i.constraint_type as string) || undefined,
        })),
        outcome.report.activities,
      )
    : null;

  return {
    outcome,
    divergence,
    calendar,
    calendarSource,
    dataDate,
    itemCount: items.length,
    freshness: cacheFreshness(inputs, project.cpm_inputs_hash as string | null),
    computedAt: (project.cpm_computed_at as string) || null,
    inputs,
  };
}

/**
 * Write the computed results into the cache columns.
 *
 * Explicit: nothing calls this on read. The stored values are stale the moment
 * a duration changes, which is exactly why the screens do not read them.
 */
export async function persistCpm(
  pb: PocketBase,
  projectId: string,
  analysis: ScheduleAnalysis,
): Promise<number> {
  if (!analysis.outcome.ok) return 0;
  let written = 0;
  for (const row of analysis.outcome.report.activities) {
    await pb.collection("schedule_items").update(row.id, {
      // Column names say whose dates these are; the values are the engine's.
      // A level-of-effort activity is written with empty dates: it was left
      // out of the pass, and a stale date from an earlier run would lie.
      cpm_early_start: row.early_start ?? "",
      cpm_early_finish: row.early_finish ?? "",
      cpm_late_start: row.late_start ?? "",
      cpm_late_finish: row.late_finish ?? "",
      // Working days — the basis lives in the type layer, not the column.
      total_float: row.total_float?.value ?? null,
      free_float: row.free_float?.value ?? null,
      is_critical: row.is_critical,
    });
    written += 1;
  }

  // Stamped from the SAME inputs object the results were computed from, not
  // re-read from the database. A second read could observe a different
  // schedule and stamp a hash for results that were never computed from it.
  await pb.collection("projects").update(projectId, {
    cpm_inputs_hash: analysis.freshness.hash,
    cpm_computed_at: new Date().toISOString(),
  });

  return written;
}
