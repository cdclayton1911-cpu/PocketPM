/**
 * Plain GC language for the schedule's internal values. The ONLY place UI text
 * for these comes from.
 *
 * Internal values such as `finish_on_or_before` never reach the screen.
 * labels.test.ts fails if any value has no label, or is labelled with itself,
 * so adding a value without wording it for a GC cannot pass.
 *
 * Constraint wording follows P6's own names: the schedules these come from
 * are P6 schedules, and a GC's scheduler reads them in P6's terms.
 */

import type { ScheduleItemActivityType, ScheduleItemConstraintType } from "@/types/enums";

import type { DivergenceCause } from "./divergence";

export const ACTIVITY_TYPE_LABEL: Record<ScheduleItemActivityType, string> = {
  task: "Task",
  start_milestone: "Start milestone",
  finish_milestone: "Finish milestone",
  level_of_effort: "Level of effort",
};

export const CONSTRAINT_TYPE_LABEL: Record<ScheduleItemConstraintType, string> = {
  start_on: "Start on",
  start_on_or_after: "Start on or after",
  start_on_or_before: "Start on or before",
  finish_on: "Finish on",
  finish_on_or_after: "Finish on or after",
  finish_on_or_before: "Finish on or before",
  mandatory_start: "Mandatory start",
  mandatory_finish: "Mandatory finish",
  as_late_as_possible: "As late as possible",
};

export const DIVERGENCE_CAUSE_LABEL: Record<DivergenceCause, { label: string; hint: string }> = {
  actual_progress: {
    label: "Actual progress",
    hint: "Set by the dates work actually started or finished.",
  },
  constraint_not_applied: {
    label: "Held by a P6 constraint",
    hint: "P6 holds this date with a constraint PocketPM doesn't apply yet.",
  },
  unexplained: {
    label: "Unexplained",
    hint: "No known reason. Check this activity's relationships and calendar.",
  },
};

/** A constraint's label, never its internal value, even for one this build doesn't know. */
export function constraintLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return CONSTRAINT_TYPE_LABEL[type as ScheduleItemConstraintType] ?? "A constraint";
}
