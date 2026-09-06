/**
 * Critical path: forward pass, backward pass, float. Pure, no I/O.
 *
 * ## Computed dates never touch imported ones
 *
 * The caller's `planned_start` / `planned_finish` are the mirrored values from
 * P6 or Excel and are read here, never written. Everything this module produces
 * lands in its own fields. Overwriting the source would destroy the only thing
 * the computation can be checked against — and do it silently, which on a
 * schedule that feeds a delay claim is the worst available failure.
 *
 * ## Conventions, stated because they are where CPM implementations disagree
 *
 * Dates are inclusive working days. An activity of duration `d` starting on
 * `ES` finishes on `addWorkingDays(ES, d - 1)`, so a 1-day activity starts and
 * finishes the same day and a milestone (`d = 0`) has `EF = ES`.
 *
 * Lag is in working days, and with one project calendar there is no ambiguity
 * about whose calendar it is measured in — a simplification inherited from the
 * phase 2 scoping decision rather than an accident.
 *
 * ## Out of scope, deliberately
 *
 * Constraints (`schedule_items` carries none), resource levelling, retained
 * logic vs progress override, out-of-sequence progress, and multiple calendars.
 * Per docs/schedule-plan.md. The consequence worth stating: for a schedule
 * containing constrained activities, these dates are correct pure logic and
 * will not match the source P6 file.
 */

import {
  addWorkingDays,
  isWorkingDay,
  workingDaysBetween,
  type ProjectCalendar,
} from "./calendar";
import { topologicalOrder, type Edge } from "./graph";
import { workingDays, type Days } from "./units";

export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface CpmActivity {
  id: string;
  duration_days?: number;
  /** Mirrored from the source schedule. Read, never written. */
  planned_start?: string;
  planned_finish?: string;
  /** Progress. Present values PIN the activity — see pinning below. */
  actual_start?: string;
  actual_finish?: string;
  is_milestone?: boolean;
}

export interface CpmRelationship extends Edge {
  type: RelationshipType;
  lag_days?: number;
}

export interface CpmResult {
  id: string;
  early_start: string | null;
  early_finish: string | null;
  late_start: string | null;
  late_finish: string | null;
  /** Working days, always — never a bare number. */
  total_float: Days | null;
  free_float: Days | null;
  is_critical: boolean;
  /** True when a date came from actual progress rather than from logic. */
  pinned_start: boolean;
  pinned_finish: boolean;
}

export interface CpmReport {
  activities: CpmResult[];
  projectStart: string | null;
  projectFinish: string | null;
  /** Activities whose dates could not be computed, with the reason. */
  unscheduled: { id: string; reason: string }[];
}

/** A cycle makes the forward pass non-terminating, so it is refused, not handled. */
export type CpmOutcome =
  | { ok: true; report: CpmReport }
  | { ok: false; error: "cycle" | "no_activities" | "no_working_days" };

function durationOf(activity: CpmActivity): number {
  if (activity.is_milestone) return 0;
  const d = activity.duration_days;
  return Number.isFinite(d) && (d as number) > 0 ? Math.floor(d as number) : 1;
}

/** The first workable day on or after `date`. */
function nextWorkingDay(date: string, calendar: ProjectCalendar): string | null {
  return isWorkingDay(date, calendar) ? date : addWorkingDays(date, 1, calendar);
}

/** The last workable day on or before `date`. */
function previousWorkingDay(date: string, calendar: ProjectCalendar): string | null {
  return isWorkingDay(date, calendar) ? date : addWorkingDays(date, -1, calendar);
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function earlierOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * The earliest a successor may START, given one predecessor's dates.
 *
 * FF and SF constrain the successor's FINISH, so they are returned as a finish
 * bound and converted by the caller. Collapsing all four into a start bound is
 * where implementations quietly get SS/FF wrong.
 */
function successorBound(
  rel: CpmRelationship,
  predStart: string | null,
  predFinish: string | null,
  calendar: ProjectCalendar,
): { startAtLeast?: string | null; finishAtLeast?: string | null } {
  const lag = Math.trunc(rel.lag_days ?? 0);
  switch (rel.type) {
    case "FS":
      // Start the working day AFTER the predecessor finishes, plus lag.
      return { startAtLeast: predFinish ? addWorkingDays(predFinish, lag + 1, calendar) : null };
    case "SS":
      return { startAtLeast: predStart ? addWorkingDays(predStart, lag, calendar) : null };
    case "FF":
      return { finishAtLeast: predFinish ? addWorkingDays(predFinish, lag, calendar) : null };
    case "SF":
      return { finishAtLeast: predStart ? addWorkingDays(predStart, lag, calendar) : null };
  }
}

/** The latest a predecessor may finish/start, given one successor's late dates. */
function predecessorBound(
  rel: CpmRelationship,
  succLateStart: string | null,
  succLateFinish: string | null,
  calendar: ProjectCalendar,
): { finishAtMost?: string | null; startAtMost?: string | null } {
  const lag = Math.trunc(rel.lag_days ?? 0);
  switch (rel.type) {
    case "FS":
      return { finishAtMost: succLateStart ? addWorkingDays(succLateStart, -(lag + 1), calendar) : null };
    case "SS":
      return { startAtMost: succLateStart ? addWorkingDays(succLateStart, -lag, calendar) : null };
    case "FF":
      return { finishAtMost: succLateFinish ? addWorkingDays(succLateFinish, -lag, calendar) : null };
    case "SF":
      return { startAtMost: succLateFinish ? addWorkingDays(succLateFinish, -lag, calendar) : null };
  }
}

export interface CpmOptions {
  /**
   * Where a schedule with no predecessors begins. Usually the project start.
   * Falls back to the earliest planned or actual start in the data.
   */
  projectStart?: string;
  /**
   * Float at or below which an activity is critical.
   *
   * Configurable because constrained schedules routinely show negative float,
   * and a fixed `=== 0` would report nothing critical on exactly the jobs where
   * it matters most.
   */
  criticalThreshold?: number;
}

export function computeCpm(
  activities: readonly CpmActivity[],
  relationships: readonly CpmRelationship[],
  calendar: ProjectCalendar,
  options: CpmOptions = {},
): CpmOutcome {
  if (activities.length === 0) return { ok: false, error: "no_activities" };
  if (!calendar.work_days?.length) return { ok: false, error: "no_working_days" };

  const ids = activities.map((a) => a.id);
  const order = topologicalOrder(ids, relationships);
  // A cycle is refused rather than handled: the forward pass would not
  // terminate, and graph.ts already returns null instead of looping.
  if (!order) return { ok: false, error: "cycle" };

  const byId = new Map(activities.map((a) => [a.id, a]));
  const known = new Set(ids);
  const incoming = new Map<string, CpmRelationship[]>();
  const outgoing = new Map<string, CpmRelationship[]>();
  for (const rel of relationships) {
    if (!known.has(rel.predecessor) || !known.has(rel.successor)) continue;
    (incoming.get(rel.successor) ?? incoming.set(rel.successor, []).get(rel.successor)!).push(rel);
    (outgoing.get(rel.predecessor) ?? outgoing.set(rel.predecessor, []).get(rel.predecessor)!).push(rel);
  }

  const fallbackStart =
    options.projectStart ||
    activities
      .flatMap((a) => [a.actual_start, a.planned_start])
      .filter((d): d is string => Boolean(d))
      .sort()[0] ||
    null;

  const es = new Map<string, string | null>();
  const ef = new Map<string, string | null>();
  const pinnedStart = new Set<string>();
  const pinnedFinish = new Set<string>();
  const unscheduled: { id: string; reason: string }[] = [];

  // ── Forward pass ──────────────────────────────────────────────────────────
  for (const id of order) {
    const activity = byId.get(id)!;
    const duration = durationOf(activity);

    let startAtLeast: string | null = null;
    let finishAtLeast: string | null = null;
    for (const rel of incoming.get(id) ?? []) {
      const bound = successorBound(rel, es.get(rel.predecessor) ?? null, ef.get(rel.predecessor) ?? null, calendar);
      startAtLeast = laterOf(startAtLeast, bound.startAtLeast ?? null);
      finishAtLeast = laterOf(finishAtLeast, bound.finishAtLeast ?? null);
    }

    // An FF or SF predecessor constrains the finish; back out the start it
    // implies so both kinds of bound can be compared on the same footing.
    if (finishAtLeast) {
      const impliedStart = duration > 0 ? addWorkingDays(finishAtLeast, -(duration - 1), calendar) : finishAtLeast;
      startAtLeast = laterOf(startAtLeast, impliedStart);
    }

    // Pinning: actual progress wins over logic. An activity that has started
    // started when it started, whatever the network says.
    let start: string | null;
    if (activity.actual_start) {
      start = activity.actual_start;
      pinnedStart.add(id);
    } else {
      start = startAtLeast ?? fallbackStart;
      start = start ? nextWorkingDay(start, calendar) : null;
    }

    let finish: string | null;
    if (activity.actual_finish) {
      finish = activity.actual_finish;
      pinnedFinish.add(id);
    } else if (start) {
      finish = duration > 0 ? addWorkingDays(start, duration - 1, calendar) : start;
    } else {
      finish = null;
    }

    if (!start) unscheduled.push({ id, reason: "no start date could be determined" });

    es.set(id, start);
    ef.set(id, finish);
  }

  const projectFinish = order
    .map((id) => ef.get(id) ?? null)
    .filter((d): d is string => Boolean(d))
    .reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);

  const projectStart = order
    .map((id) => es.get(id) ?? null)
    .filter((d): d is string => Boolean(d))
    .reduce<string | null>((min, d) => (min === null || d < min ? d : min), null);

  // ── Backward pass ─────────────────────────────────────────────────────────
  const lf = new Map<string, string | null>();
  const ls = new Map<string, string | null>();

  for (const id of [...order].reverse()) {
    const activity = byId.get(id)!;
    const duration = durationOf(activity);

    let finishAtMost: string | null = null;
    let startAtMost: string | null = null;
    for (const rel of outgoing.get(id) ?? []) {
      const bound = predecessorBound(rel, ls.get(rel.successor) ?? null, lf.get(rel.successor) ?? null, calendar);
      finishAtMost = earlierOf(finishAtMost, bound.finishAtMost ?? null);
      startAtMost = earlierOf(startAtMost, bound.startAtMost ?? null);
    }

    if (startAtMost) {
      const impliedFinish = duration > 0 ? addWorkingDays(startAtMost, duration - 1, calendar) : startAtMost;
      finishAtMost = earlierOf(finishAtMost, impliedFinish);
    }

    // No successors: the activity may run to the end of the project.
    let lateFinish = finishAtMost ?? projectFinish;
    lateFinish = lateFinish ? previousWorkingDay(lateFinish, calendar) : null;
    const lateStart = lateFinish
      ? duration > 0
        ? addWorkingDays(lateFinish, -(duration - 1), calendar)
        : lateFinish
      : null;

    lf.set(id, lateFinish);
    ls.set(id, lateStart);
  }

  // ── Float ─────────────────────────────────────────────────────────────────
  const threshold = options.criticalThreshold ?? 0;
  const results: CpmResult[] = order.map((id) => {
    const start = es.get(id) ?? null;
    const finish = ef.get(id) ?? null;
    const lateStart = ls.get(id) ?? null;
    const lateFinish = lf.get(id) ?? null;

    const total =
      start && lateStart ? workingDaysBetween(start, lateStart, calendar) : null;

    // Free float: how far this can slip without moving any successor's early
    // start. Only FS/SS successors constrain a start, so only those count.
    let free: number | null = null;
    for (const rel of outgoing.get(id) ?? []) {
      const succStart = es.get(rel.successor) ?? null;
      if (!succStart || !finish) continue;
      const lag = Math.trunc(rel.lag_days ?? 0);
      const earliestAllowed =
        rel.type === "FS"
          ? addWorkingDays(finish, lag + 1, calendar)
          : rel.type === "SS" && start
            ? addWorkingDays(start, lag, calendar)
            : null;
      if (!earliestAllowed) continue;
      const slack = workingDaysBetween(earliestAllowed, succStart, calendar);
      if (slack === null) continue;
      free = free === null ? slack : Math.min(free, slack);
    }
    if (free === null && (outgoing.get(id) ?? []).length === 0) free = total;

    return {
      id,
      early_start: start,
      early_finish: finish,
      late_start: lateStart,
      late_finish: lateFinish,
      total_float: total === null ? null : workingDays(total),
      free_float: free === null ? null : workingDays(free),
      is_critical: total !== null && total <= threshold,
      pinned_start: pinnedStart.has(id),
      pinned_finish: pinnedFinish.has(id),
    };
  });

  return { ok: true, report: { activities: results, projectStart, projectFinish, unscheduled } };
}

/** Activities on the critical path, in schedule order. */
export function criticalPath(report: CpmReport): CpmResult[] {
  return report.activities.filter((a) => a.is_critical);
}
