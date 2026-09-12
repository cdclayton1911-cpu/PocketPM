/**
 * Critical path: forward pass, backward pass, float. Pure, no I/O.
 *
 * ## Computed dates never touch imported ones
 *
 * The caller's `target_start` / `target_finish` are the mirrored values from
 * P6 or Excel and are read here, never written. Everything this module produces
 * lands in its own fields. Overwriting the source would destroy the only thing
 * the computation can be checked against — and do it silently, which on a
 * schedule that feeds a delay claim is the worst available failure.
 *
 * ## Conventions, stated because they are where CPM implementations disagree
 *
 * Dates are inclusive working days. An activity of duration `d` starting on
 * `ES` finishes on `addWorkingDays(ES, d - 1)`, so a 1-day activity starts and
 * finishes the same day.
 *
 * Each END of an activity sits at a point in its day. A task starts at the
 * start of its first day and finishes at the end of its last. A START
 * milestone is at the start of its day (both ends); a FINISH milestone is at
 * the end of its day (both ends). A relationship moves the successor to the
 * NEXT working day only when it runs from an end-of-day point to a
 * start-of-day point — see `dayOffset`. So:
 *
 *   - task → FS → task: the successor starts the next working day.
 *   - task → FS → finish milestone: the milestone lands on the task's finish
 *     day, where P6 puts it, not the day after.
 *   - start milestone → FS → task: the task starts the milestone's day.
 *
 * Lag is in working days on the one calendar the pass runs on. Converting P6's
 * hour-based lags into days (by that calendar's hours per day) is the importer's
 * job, not this module's.
 *
 * ## What the pass honours
 *
 *   - Actual dates PIN an activity: progress wins over logic.
 *   - A DATA DATE, when the schedule has one (P6 imports; a CSV has none): no
 *     remaining work is scheduled before it. An unstarted activity cannot start
 *     earlier; an in-progress one finishes its REMAINING duration counted from
 *     it. Without a data date nothing is floored, which is the CSV behaviour.
 *   - AS LATE AS POSSIBLE: the activity moves as late as its successors' early
 *     dates allow (its free float), without moving any of them. With no
 *     successors it runs to the project finish.
 *   - LEVEL OF EFFORT activities are excluded: they span other work rather
 *     than being driven by it. They are reported in `excluded` with null dates,
 *     never silently dropped, and their relationships drive nothing.
 *
 * ## Out of scope, deliberately
 *
 * Every constraint type other than ALAP (start-on, finish-on-or-before,
 * mandatory dates...) is carried on the activity but NOT applied. The
 * divergence report names that as the cause when those dates disagree with the
 * source. Also out of scope: resource levelling, retained logic vs progress
 * override for out-of-sequence progress, and multiple calendars.
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

export type ActivityType = "task" | "start_milestone" | "finish_milestone" | "level_of_effort";

export interface CpmActivity {
  id: string;
  duration_days?: number;
  /**
   * Work left, in working days. Used only when the pass has a data date:
   * P6 schedules what is left, not what was planned.
   */
  remaining_duration_days?: number;
  /** Mirrored from the source schedule. Read, never written. */
  target_start?: string;
  target_finish?: string;
  /** Progress. Present values PIN the activity — see pinning below. */
  actual_start?: string;
  actual_finish?: string;
  /**
   * task | start_milestone | finish_milestone | level_of_effort; absent means task.
   * One field rather than a boolean plus an LOE flag, so an impossible
   * "LOE finish milestone" cannot be stored.
   */
  activity_type?: ActivityType;
  /**
   * The source schedule's constraint. Only `as_late_as_possible` changes the
   * computation; the rest are carried so divergence can name them as a cause.
   */
  constraint_type?: string;
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
  /** Level of effort: left out of the pass, so every date is null by design. */
  excluded: boolean;
  /**
   * The data date decided this activity's dates: an unstarted activity held
   * to it, or an in-progress one whose remaining work was counted from it.
   */
  floored_by_data_date: boolean;
  /** Moved later by an as-late-as-possible constraint. */
  as_late_as_possible: boolean;
}

export interface CpmReport {
  activities: CpmResult[];
  projectStart: string | null;
  projectFinish: string | null;
  /** Activities whose dates could not be computed, with the reason. */
  unscheduled: { id: string; reason: string }[];
  /** Activities left out of the pass on purpose (level of effort), with the reason. */
  excluded: { id: string; reason: string }[];
  /** The data date the pass honoured, moved to a working day; null when there is none. */
  dataDate: string | null;
}

/** A cycle makes the forward pass non-terminating, so it is refused, not handled. */
export type CpmOutcome =
  | { ok: true; report: CpmReport }
  | { ok: false; error: "cycle" | "no_activities" | "no_working_days" };

function isMilestone(activity: CpmActivity): boolean {
  return activity.activity_type === "start_milestone" || activity.activity_type === "finish_milestone";
}

function durationOf(activity: CpmActivity): number {
  if (isMilestone(activity)) return 0;
  const d = activity.duration_days;
  return Number.isFinite(d) && (d as number) > 0 ? Math.floor(d as number) : 1;
}

function remainingOf(activity: CpmActivity): number | null {
  const r = activity.remaining_duration_days;
  return typeof r === "number" && Number.isFinite(r) && r >= 0 ? Math.floor(r) : null;
}

/** A finish milestone's start is the END of its day. */
function startsAtEndOfDay(activity: CpmActivity): boolean {
  return activity.activity_type === "finish_milestone";
}

/** A start milestone's finish is the START of its day. */
function finishesAtStartOfDay(activity: CpmActivity): boolean {
  return activity.activity_type === "start_milestone";
}

/**
 * 1 when the relationship runs from an end-of-day point to a start-of-day
 * point, so the successor's end moves to the next working day; otherwise 0.
 *
 * For two tasks this reproduces the usual rules — FS +1, SS/FF/SF +0 — and the
 * milestone cases fall out of the same rule rather than being special-cased.
 */
function dayOffset(rel: CpmRelationship, pred: CpmActivity, succ: CpmActivity): 0 | 1 {
  const fromPredFinish = rel.type === "FS" || rel.type === "FF";
  const toSuccStart = rel.type === "FS" || rel.type === "SS";
  const predPointEndOfDay = fromPredFinish ? !finishesAtStartOfDay(pred) : startsAtEndOfDay(pred);
  const succPointStartOfDay = toSuccStart ? !startsAtEndOfDay(succ) : finishesAtStartOfDay(succ);
  return predPointEndOfDay && succPointStartOfDay ? 1 : 0;
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
  pred: CpmActivity,
  succ: CpmActivity,
  predStart: string | null,
  predFinish: string | null,
  calendar: ProjectCalendar,
): { startAtLeast?: string | null; finishAtLeast?: string | null } {
  const shift = Math.trunc(rel.lag_days ?? 0) + dayOffset(rel, pred, succ);
  switch (rel.type) {
    case "FS":
      return { startAtLeast: predFinish ? addWorkingDays(predFinish, shift, calendar) : null };
    case "SS":
      return { startAtLeast: predStart ? addWorkingDays(predStart, shift, calendar) : null };
    case "FF":
      return { finishAtLeast: predFinish ? addWorkingDays(predFinish, shift, calendar) : null };
    case "SF":
      return { finishAtLeast: predStart ? addWorkingDays(predStart, shift, calendar) : null };
  }
}

/**
 * The latest a predecessor may finish/start, given one successor's dates.
 * The mirror of successorBound, with the same day offset.
 */
function predecessorBound(
  rel: CpmRelationship,
  pred: CpmActivity,
  succ: CpmActivity,
  succStart: string | null,
  succFinish: string | null,
  calendar: ProjectCalendar,
): { finishAtMost?: string | null; startAtMost?: string | null } {
  const shift = Math.trunc(rel.lag_days ?? 0) + dayOffset(rel, pred, succ);
  switch (rel.type) {
    case "FS":
      return { finishAtMost: succStart ? addWorkingDays(succStart, -shift, calendar) : null };
    case "SS":
      return { startAtMost: succStart ? addWorkingDays(succStart, -shift, calendar) : null };
    case "FF":
      return { finishAtMost: succFinish ? addWorkingDays(succFinish, -shift, calendar) : null };
    case "SF":
      return { startAtMost: succFinish ? addWorkingDays(succFinish, -shift, calendar) : null };
  }
}

function finishFrom(start: string, duration: number, calendar: ProjectCalendar): string | null {
  return duration > 0 ? addWorkingDays(start, duration - 1, calendar) : start;
}

function startFrom(finish: string, duration: number, calendar: ProjectCalendar): string | null {
  return duration > 0 ? addWorkingDays(finish, -(duration - 1), calendar) : finish;
}

export interface CpmOptions {
  /**
   * Where a schedule with no predecessors begins. Usually the project start.
   * Falls back to the earliest planned or actual start in the data.
   */
  projectStart?: string;
  /**
   * The source schedule's data date: no remaining work before it. Null or
   * absent when the schedule has none (a CSV), and then nothing is floored.
   */
  dataDate?: string | null;
  /**
   * Float at or below which an activity is critical.
   *
   * Configurable because constrained schedules routinely show negative float,
   * and a fixed `=== 0` would report nothing critical on exactly the jobs where
   * it matters most.
   */
  criticalThreshold?: number;
}

const LOE_REASON = "level of effort: spans other activities rather than being driven by logic, so it is left out of the pass";

export function computeCpm(
  activities: readonly CpmActivity[],
  relationships: readonly CpmRelationship[],
  calendar: ProjectCalendar,
  options: CpmOptions = {},
): CpmOutcome {
  if (activities.length === 0) return { ok: false, error: "no_activities" };
  if (!calendar.work_days?.length) return { ok: false, error: "no_working_days" };

  // Level of effort never enters the network: it neither drives nor is driven.
  const loe = activities.filter((a) => a.activity_type === "level_of_effort");
  const scheduled = activities.filter((a) => a.activity_type !== "level_of_effort");
  const ids = scheduled.map((a) => a.id);
  const known = new Set(ids);
  const network = relationships.filter((r) => known.has(r.predecessor) && known.has(r.successor));

  const order = topologicalOrder(ids, network);
  // A cycle is refused rather than handled: the forward pass would not
  // terminate, and graph.ts already returns null instead of looping.
  if (!order) return { ok: false, error: "cycle" };

  const byId = new Map(scheduled.map((a) => [a.id, a]));
  const incoming = new Map<string, CpmRelationship[]>();
  const outgoing = new Map<string, CpmRelationship[]>();
  for (const rel of network) {
    (incoming.get(rel.successor) ?? incoming.set(rel.successor, []).get(rel.successor)!).push(rel);
    (outgoing.get(rel.predecessor) ?? outgoing.set(rel.predecessor, []).get(rel.predecessor)!).push(rel);
  }

  const dataDate = options.dataDate ? nextWorkingDay(options.dataDate.slice(0, 10), calendar) : null;

  const fallbackStart =
    options.projectStart ||
    scheduled
      .flatMap((a) => [a.actual_start, a.target_start])
      .filter((d): d is string => Boolean(d))
      .sort()[0] ||
    null;

  const es = new Map<string, string | null>();
  const ef = new Map<string, string | null>();
  /** The duration each activity was scheduled with: remaining work where that applies. */
  const scheduledDuration = new Map<string, number>();
  const pinnedStart = new Set<string>();
  const pinnedFinish = new Set<string>();
  const floored = new Set<string>();
  const unscheduled: { id: string; reason: string }[] = [];

  // ── Forward pass ──────────────────────────────────────────────────────────
  for (const id of order) {
    const activity = byId.get(id)!;
    const planned = durationOf(activity);
    const remaining = remainingOf(activity);

    // With a data date, an unstarted activity is scheduled for its remaining
    // duration (in P6 usually equal to the original). Zero remaining on an
    // unstarted task is not meaningful, so the planned duration stands.
    const duration =
      !isMilestone(activity) && dataDate && !activity.actual_start && remaining !== null && remaining > 0
        ? remaining
        : planned;

    let startAtLeast: string | null = null;
    let finishAtLeast: string | null = null;
    for (const rel of incoming.get(id) ?? []) {
      const pred = byId.get(rel.predecessor)!;
      const bound = successorBound(
        rel,
        pred,
        activity,
        es.get(rel.predecessor) ?? null,
        ef.get(rel.predecessor) ?? null,
        calendar,
      );
      startAtLeast = laterOf(startAtLeast, bound.startAtLeast ?? null);
      finishAtLeast = laterOf(finishAtLeast, bound.finishAtLeast ?? null);
    }

    // An FF or SF predecessor constrains the finish; back out the start it
    // implies so both kinds of bound can be compared on the same footing.
    if (finishAtLeast) startAtLeast = laterOf(startAtLeast, startFrom(finishAtLeast, duration, calendar));

    // Pinning: actual progress wins over logic. An activity that has started
    // started when it started, whatever the network says.
    let start: string | null;
    if (activity.actual_start) {
      start = activity.actual_start;
      pinnedStart.add(id);
    } else {
      start = startAtLeast ?? fallbackStart;
      if (dataDate && (!start || start < dataDate)) {
        start = dataDate;
        floored.add(id);
      }
      start = start ? nextWorkingDay(start, calendar) : null;
    }

    let finish: string | null;
    let used = duration;
    if (activity.actual_finish) {
      finish = activity.actual_finish;
      pinnedFinish.add(id);
    } else if (activity.actual_start && dataDate) {
      // In progress: what is left is counted from the data date. Without a
      // remaining duration, the planned one less the working days already
      // elapsed, never less than a day.
      const elapsed = Math.max(0, workingDaysBetween(activity.actual_start, dataDate, calendar) ?? 0);
      const left = isMilestone(activity) ? 0 : (remaining ?? Math.max(1, planned - elapsed));
      finish =
        left > 0
          ? addWorkingDays(dataDate, left - 1, calendar)
          : laterOf(activity.actual_start, addWorkingDays(dataDate, -1, calendar));
      used = left;
      floored.add(id);
    } else if (start) {
      finish = finishFrom(start, duration, calendar);
    } else {
      finish = null;
    }

    if (!start) unscheduled.push({ id, reason: "no start date could be determined" });

    es.set(id, start);
    ef.set(id, finish);
    scheduledDuration.set(id, used);
  }

  const projectFinish = order
    .map((id) => ef.get(id) ?? null)
    .filter((d): d is string => Boolean(d))
    .reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);

  const projectStart = order
    .map((id) => es.get(id) ?? null)
    .filter((d): d is string => Boolean(d))
    .reduce<string | null>((min, d) => (min === null || d < min ? d : min), null);

  // ── As late as possible ───────────────────────────────────────────────────
  // Successors first, so each ALAP activity moves against successor dates
  // that are already final. Moving within free float cannot move a successor,
  // so no early date other than the ALAP activity's own changes.
  const alap = new Set<string>();
  for (const id of [...order].reverse()) {
    const activity = byId.get(id)!;
    if (activity.constraint_type !== "as_late_as_possible" || activity.actual_start) continue;
    const start = es.get(id) ?? null;
    if (!start) continue;
    const duration = scheduledDuration.get(id) ?? durationOf(activity);

    const successors = outgoing.get(id) ?? [];
    let finishAtMost: string | null = successors.length === 0 ? projectFinish : null;
    let startAtMost: string | null = null;
    for (const rel of successors) {
      const succ = byId.get(rel.successor)!;
      const bound = predecessorBound(
        rel,
        activity,
        succ,
        es.get(rel.successor) ?? null,
        ef.get(rel.successor) ?? null,
        calendar,
      );
      finishAtMost = earlierOf(finishAtMost, bound.finishAtMost ?? null);
      startAtMost = earlierOf(startAtMost, bound.startAtMost ?? null);
    }
    if (startAtMost) finishAtMost = earlierOf(finishAtMost, finishFrom(startAtMost, duration, calendar));
    if (!finishAtMost) continue;

    const latestFinish = previousWorkingDay(finishAtMost, calendar);
    const latestStart = latestFinish ? startFrom(latestFinish, duration, calendar) : null;
    if (latestFinish && latestStart && latestStart > start) {
      es.set(id, latestStart);
      ef.set(id, latestFinish);
      alap.add(id);
    }
  }

  // ── Backward pass ─────────────────────────────────────────────────────────
  const lf = new Map<string, string | null>();
  const ls = new Map<string, string | null>();

  for (const id of [...order].reverse()) {
    const activity = byId.get(id)!;
    const duration = scheduledDuration.get(id) ?? durationOf(activity);

    let finishAtMost: string | null = null;
    let startAtMost: string | null = null;
    for (const rel of outgoing.get(id) ?? []) {
      const succ = byId.get(rel.successor)!;
      const bound = predecessorBound(
        rel,
        activity,
        succ,
        ls.get(rel.successor) ?? null,
        lf.get(rel.successor) ?? null,
        calendar,
      );
      finishAtMost = earlierOf(finishAtMost, bound.finishAtMost ?? null);
      startAtMost = earlierOf(startAtMost, bound.startAtMost ?? null);
    }

    if (startAtMost) finishAtMost = earlierOf(finishAtMost, finishFrom(startAtMost, duration, calendar));

    // No successors: the activity may run to the end of the project.
    let lateFinish = finishAtMost ?? projectFinish;
    lateFinish = lateFinish ? previousWorkingDay(lateFinish, calendar) : null;
    const lateStart = lateFinish ? startFrom(lateFinish, duration, calendar) : null;

    lf.set(id, lateFinish);
    ls.set(id, lateStart);
  }

  // ── Float ─────────────────────────────────────────────────────────────────
  const threshold = options.criticalThreshold ?? 0;
  const results: CpmResult[] = order.map((id) => {
    const activity = byId.get(id)!;
    const start = es.get(id) ?? null;
    const finish = ef.get(id) ?? null;
    const lateStart = ls.get(id) ?? null;
    const lateFinish = lf.get(id) ?? null;

    // An in-progress activity's start is history, so start float would measure
    // the past. With a data date its float is finish float: how far what is
    // LEFT can slip. Without one, the original start-based figure stands.
    const inProgressFromDataDate = dataDate !== null && pinnedStart.has(id) && !pinnedFinish.has(id);
    const total = inProgressFromDataDate
      ? finish && lateFinish
        ? workingDaysBetween(finish, lateFinish, calendar)
        : null
      : start && lateStart
        ? workingDaysBetween(start, lateStart, calendar)
        : null;

    // Free float: how far this can slip without moving any successor's early
    // start. Only FS/SS successors constrain a start, so only those count.
    let free: number | null = null;
    for (const rel of outgoing.get(id) ?? []) {
      if (rel.type !== "FS" && rel.type !== "SS") continue;
      const succStart = es.get(rel.successor) ?? null;
      if (!succStart || !finish) continue;
      const earliestAllowed = successorBound(
        rel,
        activity,
        byId.get(rel.successor)!,
        start,
        finish,
        calendar,
      ).startAtLeast;
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
      excluded: false,
      floored_by_data_date: floored.has(id),
      as_late_as_possible: alap.has(id),
    };
  });

  for (const a of loe) {
    results.push({
      id: a.id,
      early_start: null,
      early_finish: null,
      late_start: null,
      late_finish: null,
      total_float: null,
      free_float: null,
      is_critical: false,
      pinned_start: false,
      pinned_finish: false,
      excluded: true,
      floored_by_data_date: false,
      as_late_as_possible: false,
    });
  }

  return {
    ok: true,
    report: {
      activities: results,
      projectStart,
      projectFinish,
      unscheduled,
      excluded: loe.map((a) => ({ id: a.id, reason: LOE_REASON })),
      dataDate,
    },
  };
}

/** Activities on the critical path, in schedule order. */
export function criticalPath(report: CpmReport): CpmResult[] {
  return report.activities.filter((a) => a.is_critical);
}
