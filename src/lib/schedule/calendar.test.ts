import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  defaultCalendar,
  holidayCoverageGap,
  holidayCoverageGaps,
  isWorkingDay,
  normalizeCalendar,
  seedHolidays,
  usHolidaysForYear,
  workingDaysBetween,
  type ProjectCalendar,
} from "./calendar";

const MON_FRI: ProjectCalendar = { work_days: [1, 2, 3, 4, 5], holidays: [] };

/** 2026-01-02 is a Friday. Anchors the "starts Friday" cases below. */
const FRIDAY = "2026-01-02";

describe("isWorkingDay", () => {
  it("works Monday to Friday by default", () => {
    expect(isWorkingDay("2026-01-05", MON_FRI)).toBe(true); // Monday
    expect(isWorkingDay("2026-01-03", MON_FRI)).toBe(false); // Saturday
    expect(isWorkingDay("2026-01-04", MON_FRI)).toBe(false); // Sunday
  });

  it("treats a holiday as non-working", () => {
    const cal = { ...MON_FRI, holidays: [{ date: "2026-01-05", label: "Site closed" }] };
    expect(isWorkingDay("2026-01-05", cal)).toBe(false);
  });

  it("supports a six-day week", () => {
    expect(isWorkingDay("2026-01-03", { work_days: [1, 2, 3, 4, 5, 6], holidays: [] })).toBe(true);
  });

  it("is false for an unparseable date rather than throwing", () => {
    expect(isWorkingDay("not-a-date", MON_FRI)).toBe(false);
  });
});

/**
 * The timezone guard.
 *
 * These dates are UTC midnight. Under a negative-offset TZ (America/*),
 * local-time methods read them as the PREVIOUS day, so a Monday reads as
 * Sunday and every working-day count shifts. Running the suite with
 * TZ=America/Los_Angeles must not change a single answer here.
 */
describe("UTC anchoring", () => {
  it("reads weekdays in UTC, not local time", () => {
    // 2026-01-05T00:00:00Z is a Monday everywhere in UTC terms. In
    // America/Los_Angeles it is Sunday 16:00 local — getDay() would say 0.
    expect(isWorkingDay("2026-01-05", MON_FRI)).toBe(true);
    // 2026-01-04 is a Sunday in UTC; in Asia/Tokyo it is Sunday 09:00, but a
    // positive-offset TZ shifts other dates instead.
    expect(isWorkingDay("2026-01-04", MON_FRI)).toBe(false);
    expect(isWorkingDay("2026-01-11", MON_FRI)).toBe(false); // Sunday
    expect(isWorkingDay("2026-01-12", MON_FRI)).toBe(true); // Monday
  });

  it("keeps arithmetic stable across a DST boundary", () => {
    // US DST begins 2026-03-08. A local-time implementation loses or gains an
    // hour here, and a date built by adding 86_400_000ms lands on the wrong day.
    expect(addWorkingDays("2026-03-06", 1, MON_FRI)).toBe("2026-03-09");
    expect(workingDaysBetween("2026-03-06", "2026-03-13", MON_FRI)).toBe(5);
  });

  it("reports the fourth Thursday of November regardless of host timezone", () => {
    const thanksgiving = usHolidaysForYear(2026).find((h) => h.label === "Thanksgiving");
    expect(thanksgiving?.date).toBe("2026-11-26");
  });
});

describe("addWorkingDays", () => {
  it("lands a ten-day activity starting Friday on the right working day", () => {
    // Durations include their start, so a 10-day activity finishes at +9.
    // Fri 02 → Mon 05..Fri 09 (5) → Mon 12..Thu 15 (9). Weekends skipped.
    expect(addWorkingDays(FRIDAY, 9, MON_FRI)).toBe("2026-01-15");
  });

  it("never lands on a weekend", () => {
    for (let n = 1; n <= 25; n += 1) {
      const landed = addWorkingDays(FRIDAY, n, MON_FRI);
      expect(isWorkingDay(landed!, MON_FRI)).toBe(true);
    }
  });

  it("returns the date unchanged for n = 0, even on a non-working day", () => {
    // Moving nowhere must not relocate the caller: a zero-length span that
    // silently jumped to Monday would stop being zero-length.
    expect(addWorkingDays("2026-01-03", 0, MON_FRI)).toBe("2026-01-03");
  });

  it("steps backwards for negative n", () => {
    // Mon 05 back one working day is Fri 02, not Sun 04.
    expect(addWorkingDays("2026-01-05", -1, MON_FRI)).toBe(FRIDAY);
    expect(addWorkingDays("2026-01-15", -9, MON_FRI)).toBe(FRIDAY);
  });

  it("skips a holiday as well as the weekend", () => {
    const cal = { ...MON_FRI, holidays: [{ date: "2026-01-05", label: "Closed" }] };
    expect(addWorkingDays(FRIDAY, 1, cal)).toBe("2026-01-06");
  });

  it("does not double-count a holiday falling on a weekend", () => {
    // Saturday was never worked. Counting it as a holiday too would shorten
    // every duration spanning it by a day.
    const cal = { ...MON_FRI, holidays: [{ date: "2026-01-03", label: "Saturday holiday" }] };
    expect(addWorkingDays(FRIDAY, 1, cal)).toBe(addWorkingDays(FRIDAY, 1, MON_FRI));
  });

  it("returns null rather than looping when no day is ever workable", () => {
    expect(addWorkingDays(FRIDAY, 1, { work_days: [], holidays: [] })).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(addWorkingDays("nope", 3, MON_FRI)).toBeNull();
  });
});

describe("workingDaysBetween", () => {
  it("counts the half-open interval", () => {
    // Mon 05 to Mon 12 is five working days: Mon–Fri, excluding the end.
    expect(workingDaysBetween("2026-01-05", "2026-01-12", MON_FRI)).toBe(5);
  });

  it("is zero for a zero-length span", () => {
    expect(workingDaysBetween(FRIDAY, FRIDAY, MON_FRI)).toBe(0);
  });

  it("is zero when every day in the span is a holiday", () => {
    const cal: ProjectCalendar = {
      work_days: [1, 2, 3, 4, 5],
      holidays: [
        { date: "2026-01-05" },
        { date: "2026-01-06" },
        { date: "2026-01-07" },
        { date: "2026-01-08" },
        { date: "2026-01-09" },
      ],
    };
    expect(workingDaysBetween("2026-01-05", "2026-01-10", cal)).toBe(0);
  });

  it("is negative when the end precedes the start", () => {
    expect(workingDaysBetween("2026-01-12", "2026-01-05", MON_FRI)).toBe(-5);
  });

  it("counts nothing across a weekend alone", () => {
    expect(workingDaysBetween("2026-01-03", "2026-01-05", MON_FRI)).toBe(0);
  });
});

describe("holiday seeding", () => {
  it("computes the recurrence rules, not fixed dates", () => {
    const y = usHolidaysForYear(2026);
    const on = (label: string) => y.find((h) => h.label === label)?.date;
    expect(on("Martin Luther King Jr. Day")).toBe("2026-01-19"); // 3rd Monday
    expect(on("Memorial Day")).toBe("2026-05-25"); // last Monday
    expect(on("Labor Day")).toBe("2026-09-07"); // 1st Monday
    expect(on("Day after Thanksgiving")).toBe("2026-11-27");
  });

  it("applies the observed-day shift for a weekend holiday", () => {
    // 2027-07-04 is a Sunday, observed Monday the 5th.
    expect(usHolidaysForYear(2027).find((h) => h.label === "Independence Day")?.date).toBe(
      "2027-07-05",
    );
    // 2026-07-04 is a Saturday, observed Friday the 3rd.
    expect(usHolidaysForYear(2026).find((h) => h.label === "Independence Day")?.date).toBe(
      "2026-07-03",
    );
  });

  it("covers the project span plus a margin year", () => {
    const seeded = seedHolidays("2026-03-01", "2027-06-30");
    const years = new Set(seeded.map((h) => h.date.slice(0, 4)));
    expect(years).toEqual(new Set(["2026", "2027", "2028"]));
  });

  it("returns nothing for an unparseable span rather than guessing", () => {
    expect(seedHolidays("", "2027-01-01")).toEqual([]);
  });

  it("is sorted, so the last entry is the coverage end", () => {
    const seeded = seedHolidays("2026-01-01", "2026-12-31", 0);
    expect([...seeded].sort((a, b) => (a.date < b.date ? -1 : 1))).toEqual(seeded);
  });
});

describe("holidayCoverageGap", () => {
  const seeded = { work_days: [1, 2, 3, 4, 5], holidays: seedHolidays("2026-01-01", "2026-12-31", 0) };

  it("is silent while the schedule stays inside the seeded range", () => {
    expect(holidayCoverageGap(seeded, "2026-11-01")).toBeNull();
  });

  it("reports a schedule running past the seeded holidays", () => {
    // The failure the seeding approach creates: without this the tail is
    // treated as holiday-free and the schedule works through Christmas.
    const gap = holidayCoverageGap(seeded, "2028-03-01");
    expect(gap).not.toBeNull();
    expect(gap?.scheduleEnds).toBe("2028-03-01");
    expect(gap?.coveredThrough).toBe("2026-12-25");
  });

  it("reports a gap when no holidays exist at all", () => {
    const gap = holidayCoverageGap(defaultCalendar(), "2026-06-01");
    expect(gap?.coveredThrough).toBeNull();
  });
});

describe("normalizeCalendar", () => {
  it("supplies Mon–Fri for a project that has never set a calendar", () => {
    expect(normalizeCalendar(null).work_days).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeCalendar({}).work_days).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeCalendar({ work_days: [] }).work_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a real calendar as it is", () => {
    expect(normalizeCalendar({ work_days: [1, 2, 3, 4, 5, 6] }).work_days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("drops junk rather than letting it reach the arithmetic", () => {
    // PocketBase json accepts anything; the boundary is where that stops.
    const cal = normalizeCalendar({ work_days: [1, 9, -2, 3] as number[], holidays: [{ date: "x" }] });
    expect(cal.work_days).toEqual([1, 3]);
    expect(cal.holidays).toEqual([]);
  });

  it("does not turn a genuinely empty calendar into a working one after normalization", () => {
    // The pure function stays honest: an explicitly empty array means nothing
    // is worked, and addWorkingDays says so instead of inventing dates.
    expect(addWorkingDays(FRIDAY, 1, { work_days: [], holidays: [] })).toBeNull();
  });
});

describe("holidayCoverageGaps — holes inside the list, not only at its end", () => {
  /**
   * The shape of a real P6 calendar: holidays for 2013–2017 and 2023–2025 and
   * none between, on a project that started in 2022. Generic US holiday dates;
   * nothing that identifies the project.
   */
  const REAL_SHAPE: ProjectCalendar = {
    work_days: [1, 2, 3, 4, 5],
    holidays: [
      "2013-07-04", "2013-09-02", "2013-11-21", "2013-11-22", "2013-12-25", "2014-01-01",
      "2015-11-26", "2015-12-25", "2016-01-01", "2016-07-04", "2016-09-05", "2016-11-24",
      "2016-11-25", "2016-12-23", "2017-07-04", "2017-11-23", "2017-11-24", "2017-12-25",
      "2023-05-29", "2023-07-04", "2023-09-04", "2023-11-23", "2023-11-24", "2023-12-25",
      "2023-12-26", "2024-01-01", "2024-05-27", "2024-07-04", "2024-09-02", "2024-11-28",
      "2024-11-29", "2024-12-25", "2024-12-26", "2025-01-01",
    ].map((date) => ({ date })),
  };
  const PROJECT = { start: "2022-02-24", end: "2024-10-23" };

  it("reports the 2018–2022 hole the project starts inside", () => {
    expect(holidayCoverageGaps(REAL_SHAPE, PROJECT)).toEqual([
      { fromYear: 2018, toYear: 2022, kind: "within" },
    ]);
  });

  it("which the end-only check misses entirely", () => {
    // The list runs past the finish, so the old check calls this covered.
    expect(holidayCoverageGap(REAL_SHAPE, PROJECT.end)).toBeNull();
  });

  it("finds nothing when every year of the span has holidays", () => {
    // The positive control: a check that reported a gap for everything would
    // pass the test above and be useless.
    const cal = { work_days: [1, 2, 3, 4, 5], holidays: seedHolidays("2026-01-01", "2027-12-31", 0) };
    expect(holidayCoverageGaps(cal, { start: "2026-03-01", end: "2027-06-30" })).toEqual([]);
  });

  it("reports a tail gap as after", () => {
    const cal = { work_days: [1, 2, 3, 4, 5], holidays: [{ date: "2026-12-25" }] };
    expect(holidayCoverageGaps(cal, { start: "2026-01-05", end: "2028-06-30" })).toEqual([
      { fromYear: 2027, toYear: 2028, kind: "after" },
    ]);
  });

  it("reports a head gap as before", () => {
    const cal = { work_days: [1, 2, 3, 4, 5], holidays: [{ date: "2028-07-04" }] };
    expect(holidayCoverageGaps(cal, { start: "2026-01-05", end: "2028-09-30" })).toEqual([
      { fromYear: 2026, toYear: 2027, kind: "before" },
    ]);
  });

  it("says so when there are no holidays at all", () => {
    expect(holidayCoverageGaps(defaultCalendar(), { start: "2026-01-05", end: "2027-03-01" })).toEqual([
      { fromYear: 2026, toYear: 2027, kind: "none_at_all" },
    ]);
  });

  it("ignores a hole the schedule never runs through", () => {
    const cal = {
      work_days: [1, 2, 3, 4, 5],
      holidays: [{ date: "2010-12-25" }, { date: "2015-12-25" }, { date: "2016-12-25" }],
    };
    expect(holidayCoverageGaps(cal, { start: "2015-01-05", end: "2016-11-30" })).toEqual([]);
  });

  it("returns nothing for an unreadable span rather than guessing one", () => {
    expect(holidayCoverageGaps(REAL_SHAPE, { start: "", end: "2024-01-01" })).toEqual([]);
  });
});
