/**
 * The project working calendar. Pure, no I/O.
 *
 * One calendar per project, by decision (docs/schedule-plan.md): no
 * per-activity calendars and no multiple calendars per project, so
 * `schedule_items` needs no calendar relation at all.
 *
 * ## Everything here is UTC
 *
 * `getUTCDay()`, never `getDay()`. `daysBetween` in variance.ts is already
 * UTC-anchored so a DST transition cannot silently cost a day, and two date
 * modules in one codebase disagreeing about anchoring is a bug that only
 * appears in some offsets — which is to say, not on the machine of whoever
 * wrote it. `calendar.test.ts` fails under a non-UTC TZ if local-time methods
 * creep back in.
 *
 * ## Weather days are deliberately absent
 *
 * A weather day is a retroactive contractual determination that a specific date
 * was unworkable. It belongs with the daily logs as claim evidence. Baking it
 * into the calendar would mean editing history to reflect a dispute outcome,
 * which corrupts the as-planned baseline the claim is argued against.
 */

export interface Holiday {
  /** YYYY-MM-DD. */
  date: string;
  label?: string;
}

export interface ProjectCalendar {
  /** Weekday numbers that are worked, 0 = Sunday, matching Date.getUTCDay(). */
  work_days: number[];
  holidays: Holiday[];
}

/** Monday–Friday. The default when a project has never set a calendar. */
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

export function defaultCalendar(): ProjectCalendar {
  return { work_days: [...DEFAULT_WORK_DAYS], holidays: [] };
}

/**
 * Turn what PocketBase stores into a usable calendar.
 *
 * A project that has never had a calendar set comes back with an empty or
 * missing `work_days`, which the arithmetic would correctly read as "nothing
 * is ever worked". Mon–Fri is applied HERE, once, at the boundary — so the
 * default is a documented property of loading a project rather than a
 * surprise buried in a date function.
 */
export function normalizeCalendar(raw: Partial<ProjectCalendar> | null | undefined): ProjectCalendar {
  const workDays = Array.isArray(raw?.work_days) && raw.work_days.length > 0
    ? raw.work_days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [...DEFAULT_WORK_DAYS];
  const holidays = Array.isArray(raw?.holidays)
    ? raw.holidays.filter((h) => typeof h?.date === "string" && h.date.length >= 10)
    : [];
  return { work_days: workDays, holidays };
}

/** Parse YYYY-MM-DD to a UTC-midnight Date. Null when unparseable. */
export function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Format a Date back to YYYY-MM-DD, in UTC. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Is this a working day?
 *
 * A holiday landing on a day that is already non-working changes nothing —
 * the day was not worked either way, and counting it twice would shorten
 * every duration that spans it.
 */
export function isWorkingDay(date: string | Date, calendar: ProjectCalendar): boolean {
  const d = typeof date === "string" ? parseDate(date) : date;
  if (!d) return false;
  // Taken as given. An explicitly empty work_days means NO day is worked, and
  // quietly substituting Mon–Fri here would hide a misconfigured calendar
  // behind plausible dates. Supplying the default belongs at the data
  // boundary — see normalizeCalendar — not in the arithmetic.
  const workDays = Array.isArray(calendar.work_days) ? calendar.work_days : DEFAULT_WORK_DAYS;
  if (!workDays.includes(d.getUTCDay())) return false;
  const iso = formatDate(d);
  return !(calendar.holidays ?? []).some((h) => h.date === iso);
}

/** Guard against an all-holiday or no-work-days calendar looping forever. */
const MAX_STEPS = 20_000;

/**
 * Move `n` working days from `from`.
 *
 * `n = 0` returns the date unchanged, even if it is not a working day — the
 * caller asked to move nowhere, and quietly relocating them to the next
 * working day would make a zero-length span non-zero.
 *
 * Durations are inclusive of their start, so a 10-day activity finishes at
 * `addWorkingDays(start, 9)`.
 *
 * Returns null if no such day exists within a bounded search, which is what a
 * calendar with no working days at all would otherwise turn into: an infinite
 * loop rather than an error.
 */
export function addWorkingDays(
  from: string,
  n: number,
  calendar: ProjectCalendar,
): string | null {
  const start = parseDate(from);
  if (!start) return null;
  if (n === 0) return formatDate(start);

  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cursor = start;

  for (let guard = 0; guard < MAX_STEPS && remaining > 0; guard += 1) {
    cursor = shiftDays(cursor, step);
    if (isWorkingDay(cursor, calendar)) remaining -= 1;
  }

  return remaining === 0 ? formatDate(cursor) : null;
}

/**
 * Working days in the half-open interval [from, to).
 *
 * Half-open so it composes with `daysBetween`, which is a plain difference:
 * both give 0 for a zero-length span, and neither double-counts an endpoint.
 * Negative when `to` precedes `from`.
 */
export function workingDaysBetween(
  from: string,
  to: string,
  calendar: ProjectCalendar,
): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  if (a.getTime() === b.getTime()) return 0;

  const backwards = b.getTime() < a.getTime();
  const start = backwards ? b : a;
  const end = backwards ? a : b;

  let count = 0;
  let cursor = start;
  for (let guard = 0; guard < MAX_STEPS && cursor.getTime() < end.getTime(); guard += 1) {
    if (isWorkingDay(cursor, calendar)) count += 1;
    cursor = shiftDays(cursor, 1);
  }

  return backwards ? -count : count;
}

// ── Holiday seeding ─────────────────────────────────────────────────────────

/**
 * US federal holidays are recurrence RULES, not dates — third Monday of
 * January, fourth Thursday of November — so a seed of literal dates is right
 * for exactly one year.
 *
 * Rather than ship a recurrence engine, concrete dates are generated once for
 * the project's own span and stored as ordinary editable dates. The cost is
 * that a project extended past its seeded range runs out of holidays; that is
 * detected by `holidayCoverageGap` rather than left to surface as a schedule
 * that quietly works through Christmas.
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month + 1, 0 - offset));
}

/**
 * The observed-day shift for a fixed-date holiday.
 *
 * Saturday moves to the Friday before, Sunday to the Monday after — the
 * federal rule, and what most commercial jobs follow.
 */
function observed(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return shiftDays(date, -1);
  if (day === 0) return shiftDays(date, 1);
  return date;
}

/** US federal holidays for one year, plus the day after Thanksgiving. */
export function usHolidaysForYear(year: number): Holiday[] {
  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
  const entries: [Date, string][] = [
    [observed(new Date(Date.UTC(year, 0, 1))), "New Year's Day"],
    [nthWeekdayOfMonth(year, 0, 1, 3), "Martin Luther King Jr. Day"],
    [nthWeekdayOfMonth(year, 1, 1, 3), "Presidents' Day"],
    [lastWeekdayOfMonth(year, 4, 1), "Memorial Day"],
    [observed(new Date(Date.UTC(year, 5, 19))), "Juneteenth"],
    [observed(new Date(Date.UTC(year, 6, 4))), "Independence Day"],
    [nthWeekdayOfMonth(year, 8, 1, 1), "Labor Day"],
    [nthWeekdayOfMonth(year, 9, 1, 2), "Columbus Day"],
    [observed(new Date(Date.UTC(year, 10, 11))), "Veterans Day"],
    [thanksgiving, "Thanksgiving"],
    // Not federal, but worked by almost nobody on a commercial job.
    [shiftDays(thanksgiving, 1), "Day after Thanksgiving"],
    [observed(new Date(Date.UTC(year, 11, 25))), "Christmas Day"],
  ];
  return entries.map(([date, label]) => ({ date: formatDate(date), label }));
}

/**
 * Concrete holidays covering a project's span, plus a margin.
 *
 * The margin exists because projects run long. It does not remove the problem,
 * only postpones it — `holidayCoverageGap` is what actually reports it.
 */
export function seedHolidays(
  startDate: string,
  endDate: string,
  marginYears = 1,
): Holiday[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return [];

  const firstYear = start.getUTCFullYear();
  const lastYear = end.getUTCFullYear() + Math.max(0, marginYears);

  const out: Holiday[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) out.push(...usHolidaysForYear(year));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The last date the holiday list actually covers, or null when it is empty. */
export function holidayCoverageEnd(holidays: readonly Holiday[]): string | null {
  if (!holidays.length) return null;
  return holidays.reduce((max, h) => (h.date > max ? h.date : max), holidays[0].date);
}

export interface CoverageGap {
  coveredThrough: string | null;
  scheduleEnds: string;
}

/**
 * Does the schedule run past the holidays we have?
 *
 * Returns a gap when it does, so the caller can say so. The alternative —
 * treating the uncovered tail as holiday-free — produces a schedule that works
 * through Christmas and gives no sign of having done so, which is the precise
 * failure the seeding approach creates and therefore has to own.
 */
export function holidayCoverageGap(
  calendar: ProjectCalendar,
  scheduleEnds: string,
): CoverageGap | null {
  if (!scheduleEnds) return null;
  const coveredThrough = holidayCoverageEnd(calendar.holidays ?? []);
  if (coveredThrough && coveredThrough >= scheduleEnds) return null;
  return { coveredThrough, scheduleEnds };
}
