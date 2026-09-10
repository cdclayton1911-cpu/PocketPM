/**
 * Geometry for the Gantt. Pure, no React, no SVG.
 *
 * Everything that can be got wrong numerically lives here so it can be tested;
 * the component turns these numbers into elements and is not itself tested.
 *
 * ## Fixed weekly columns, no zoom
 *
 * A four-year job is about 220 weekly columns, which scrolls horizontally
 * without difficulty. Daily resolution over the same span is roughly 1,550
 * columns and needs virtualisation for the axis alone. Zoom is cheap to add if
 * a fixed scale proves insufficient, and expensive to guess at now.
 */

import { isWorkingDay, parseDate, formatDate, type ProjectCalendar } from "./calendar";

/** Pixels for one week column. Days are derived, never the other way round. */
export const WEEK_WIDTH = 28;
export const PX_PER_DAY = WEEK_WIDTH / 7;
export const ROW_HEIGHT = 24;

export interface WeekColumn {
  /** Monday of this week, YYYY-MM-DD. */
  start: string;
  x: number;
  /** Set on the first column of each month, for the header band. */
  monthLabel?: string;
}

export interface GanttScale {
  /** Monday on or before the earliest date. */
  start: string;
  /** Sunday on or after the latest date. */
  end: string;
  weeks: WeekColumn[];
  width: number;
}

const DAY_MS = 86_400_000;

function shift(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Monday on or before the given date. UTC throughout, as everywhere else. */
export function startOfWeek(iso: string): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  // getUTCDay: 0 = Sunday. Monday-based weeks put Sunday six days after Monday.
  const offset = (d.getUTCDay() + 6) % 7;
  return formatDate(shift(d, -offset));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build the week columns spanning [from, to].
 *
 * Returns null when either bound is unreadable rather than inventing a range —
 * a chart drawn over guessed dates is worse than no chart, because it looks
 * like information.
 */
export function buildScale(from: string, to: string): GanttScale | null {
  const startIso = startOfWeek(from);
  const endDate = parseDate(to);
  if (!startIso || !endDate) return null;

  const startDate = parseDate(startIso);
  if (!startDate || endDate.getTime() < startDate.getTime()) return null;

  const weeks: WeekColumn[] = [];
  let cursor = startDate;
  let lastMonth = -1;
  let x = 0;

  // Bounded so a corrupt date cannot spin here: 5,200 weeks is a century.
  for (let guard = 0; guard < 5_200; guard += 1) {
    const month = cursor.getUTCMonth();
    weeks.push({
      start: formatDate(cursor),
      x,
      monthLabel:
        month !== lastMonth
          ? `${MONTHS[month]}${month === 0 || weeks.length === 0 ? ` ${cursor.getUTCFullYear()}` : ""}`
          : undefined,
    });
    lastMonth = month;
    x += WEEK_WIDTH;
    const next = shift(cursor, 7);
    if (next.getTime() > endDate.getTime()) break;
    cursor = next;
  }

  return {
    start: startIso,
    end: formatDate(shift(cursor, 6)),
    weeks,
    width: weeks.length * WEEK_WIDTH,
  };
}

/** Whole days from the scale start; may be negative or past the end. */
export function daysFromStart(scale: GanttScale, iso: string): number | null {
  const start = parseDate(scale.start);
  const date = parseDate(iso);
  if (!start || !date) return null;
  return Math.round((date.getTime() - start.getTime()) / DAY_MS);
}

/** X coordinate for the START of a day. */
export function dateToX(scale: GanttScale, iso: string): number | null {
  const days = daysFromStart(scale, iso);
  return days === null ? null : days * PX_PER_DAY;
}

export type BarKind = "bar" | "milestone" | "none";

export interface BarGeometry {
  kind: BarKind;
  x: number;
  width: number;
  /** Why nothing can be drawn, when kind is "none". */
  reason?: string;
}

export interface GanttActivity {
  target_start?: string;
  target_finish?: string;
  is_milestone?: boolean;
}

/**
 * Where one activity's bar sits.
 *
 * Dates are INCLUSIVE, so a one-day activity is one day wide rather than zero.
 * A milestone is a marker at its date, not a zero-width bar that would be
 * invisible at any scale.
 */
export function barGeometry(scale: GanttScale, activity: GanttActivity): BarGeometry {
  const start = activity.target_start || activity.target_finish || "";
  if (!start) return { kind: "none", x: 0, width: 0, reason: "no dates" };

  const x = dateToX(scale, start);
  if (x === null) return { kind: "none", x: 0, width: 0, reason: "unreadable date" };

  if (activity.is_milestone) {
    return { kind: "milestone", x, width: 0 };
  }

  const finish = activity.target_finish || activity.target_start || "";
  const startDays = daysFromStart(scale, start);
  const finishDays = daysFromStart(scale, finish);
  if (startDays === null || finishDays === null) {
    return { kind: "none", x: 0, width: 0, reason: "unreadable date" };
  }

  // A finish before its start is bad data, not a negative-width rectangle.
  const span = Math.max(0, finishDays - startDays) + 1;
  return { kind: "bar", x, width: span * PX_PER_DAY };
}

export interface Span {
  x: number;
  width: number;
}

/**
 * Runs of non-working days, merged.
 *
 * One rect per non-working DAY would be about 1,550 elements on a four-year
 * job; merging consecutive days gives roughly 235, since weekends are pairs.
 * Merging is also what makes a holiday adjoining a weekend read as one closure
 * rather than two.
 */
export function nonWorkingSpans(scale: GanttScale, calendar: ProjectCalendar): Span[] {
  const start = parseDate(scale.start);
  const end = parseDate(scale.end);
  if (!start || !end) return [];

  const spans: Span[] = [];
  let runStart: number | null = null;
  let day = 0;

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = shift(cursor, 1), day += 1) {
    const off = !isWorkingDay(cursor, calendar);
    if (off && runStart === null) runStart = day;
    if (!off && runStart !== null) {
      spans.push({ x: runStart * PX_PER_DAY, width: (day - runStart) * PX_PER_DAY });
      runStart = null;
    }
  }
  if (runStart !== null) {
    spans.push({ x: runStart * PX_PER_DAY, width: (day - runStart) * PX_PER_DAY });
  }
  return spans;
}

/**
 * The date range the chart must cover.
 *
 * Falls back to the project span when no activity carries a date, so an
 * unscheduled import still renders an axis rather than nothing.
 */
export function scheduleBounds(
  activities: readonly GanttActivity[],
  fallbackStart?: string,
  fallbackEnd?: string,
): { from: string; to: string } | null {
  const dates = activities
    .flatMap((a) => [a.target_start, a.target_finish])
    .filter((d): d is string => Boolean(d))
    .sort();

  const from = dates[0] ?? fallbackStart;
  const to = dates[dates.length - 1] ?? fallbackEnd;
  if (!from || !to) return null;
  return { from, to };
}
