/**
 * Durations and variances carry the unit they are measured in.
 *
 * The failure this prevents: once CPM produces working-day durations, a report
 * can show a 10-day activity finishing 14 days late with the two numbers in
 * different units on the same row. A reader will reasonably conclude the
 * activity slipped by more than its own duration, and be wrong.
 *
 * Making the basis part of the value means a working-day number cannot be
 * rendered into a calendar-day field without something noticing — the mixed
 * row becomes unrepresentable rather than merely discouraged. Same move as
 * keeping the refined and unrefined Zod schemas apart: remove the hazard
 * instead of writing a rule about it.
 *
 * Contract time is CALENDAR time — liquidated damages accrue on Sundays — so
 * variance against a baseline stays calendar-based. Working days are what CPM
 * counts when deciding when work can actually happen. Both are correct; they
 * are just not the same number.
 */

export type DayBasis = "calendar" | "working";

export interface Days {
  value: number;
  basis: DayBasis;
}

export function calendarDays(value: number): Days {
  return { value, basis: "calendar" };
}

export function workingDays(value: number): Days {
  return { value, basis: "working" };
}

/** Short suffix for display: "14 cd" / "10 wd". */
export function basisSuffix(basis: DayBasis): string {
  return basis === "calendar" ? "cd" : "wd";
}

export function formatDays(days: Days | null, fallback = "—"): string {
  if (!days) return fallback;
  return `${days.value} ${basisSuffix(days.basis)}`;
}

/**
 * Add two day counts, refusing to mix bases.
 *
 * Returns null rather than throwing so a caller that got its units wrong
 * produces a visibly missing number instead of a plausible one. Silently
 * coercing would be the exact bug this module exists to prevent.
 */
export function addDays(a: Days, b: Days): Days | null {
  return a.basis === b.basis ? { value: a.value + b.value, basis: a.basis } : null;
}

/** Compare two counts, only when they share a basis. */
export function compareDays(a: Days, b: Days): number | null {
  return a.basis === b.basis ? a.value - b.value : null;
}
