import { describe, expect, it } from "vitest";

import {
  computeVariance,
  daysBetween,
  slippedActivities,
  type BaselineRow,
  type CurrentRow,
} from "../variance";
import { addDays, calendarDays, compareDays, formatDays, workingDays } from "../units";

const BASE: BaselineRow[] = [
  { activity_id: "A1010", activity: "Mobilize", start: "2026-03-02", finish: "2026-03-06" },
  { activity_id: "A1020", activity: "Excavate", start: "2026-03-09", finish: "2026-03-20" },
  { activity_id: "A1030", activity: "Foundations", start: "2026-03-23", finish: "2026-04-10" },
];

describe("daysBetween", () => {
  // Asserting the whole object, not just the number: the basis is now part of
  // the answer, and a working-day result here would be a real defect.
  it("counts forward", () =>
    expect(daysBetween("2026-03-02", "2026-03-06")).toEqual({ value: 4, basis: "calendar" }));
  it("counts backward as negative", () =>
    expect(daysBetween("2026-03-06", "2026-03-02")).toEqual({ value: -4, basis: "calendar" }));
  it("is null when a date is missing", () => expect(daysBetween("", "2026-03-06")).toBeNull());
  it("is null on an unparseable date", () => expect(daysBetween("March 2nd", "2026-03-06")).toBeNull());
  it("is unaffected by DST — dates are UTC-anchored", () => {
    // 2026-03-08 is a US DST transition; a local-time implementation returns 6.
    // Calendar days, deliberately: contract time runs over the weekend.
    expect(daysBetween("2026-03-05", "2026-03-12")).toEqual({ value: 7, basis: "calendar" });
  });
});

describe("computeVariance", () => {
  it("reports slip against the baseline", () => {
    const current: CurrentRow[] = [
      { activity_id: "A1010", planned_start: "2026-03-02", actual_finish: "2026-03-06" },
      { activity_id: "A1020", planned_start: "2026-03-11", planned_finish: "2026-03-25" },
      { activity_id: "A1030", planned_start: "2026-03-23", planned_finish: "2026-04-10" },
    ];
    const report = computeVariance(BASE, current);
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0].finish_variance).toEqual({ value: 0, basis: "calendar" });
    expect(report.rows[1].start_variance).toEqual({ value: 2, basis: "calendar" });
    expect(report.rows[1].finish_variance).toEqual({ value: 5, basis: "calendar" });
  });

  it("prefers actual dates over planned — that is what current means", () => {
    const report = computeVariance(
      [{ activity_id: "X", start: "2026-01-01", finish: "2026-01-10" }],
      [{ activity_id: "X", planned_finish: "2026-01-10", actual_finish: "2026-01-18" }],
    );
    expect(report.rows[0].finish_variance).toEqual({ value: 8, basis: "calendar" });
  });

  it("falls back to forecast when there is no actual", () => {
    const report = computeVariance(
      [{ activity_id: "X", finish: "2026-01-10" }],
      [{ activity_id: "X", planned_finish: "2026-01-10", forecast_finish: "2026-01-15" }],
    );
    expect(report.rows[0].finish_variance).toEqual({ value: 5, basis: "calendar" });
  });

  it("REPORTS activities missing from the current schedule rather than dropping them", () => {
    const report = computeVariance(BASE, [
      { activity_id: "A1010", planned_finish: "2026-03-06" },
    ]);
    expect(report.missingFromCurrent).toEqual(["A1020", "A1030"]);
    expect(report.rows).toHaveLength(1);
  });

  it("reports activities added since the baseline", () => {
    const report = computeVariance(
      [{ activity_id: "A1010", finish: "2026-03-06" }],
      [
        { activity_id: "A1010", planned_finish: "2026-03-06" },
        { activity_id: "A9999", planned_finish: "2026-05-01" },
      ],
    );
    expect(report.addedSinceBaseline).toEqual(["A9999"]);
  });

  it("yields null variance rather than a wrong number when a date is absent", () => {
    const report = computeVariance(
      [{ activity_id: "X", finish: "2026-01-10" }],
      [{ activity_id: "X" }],
    );
    expect(report.rows[0].finish_variance).toBeNull();
  });

  it("handles an empty baseline", () => {
    const report = computeVariance([], [{ activity_id: "A" }]);
    expect(report.rows).toHaveLength(0);
    expect(report.addedSinceBaseline).toEqual(["A"]);
  });
});

describe("slippedActivities", () => {
  it("returns only late activities, worst first", () => {
    const report = computeVariance(BASE, [
      { activity_id: "A1010", planned_finish: "2026-03-06" },
      { activity_id: "A1020", planned_finish: "2026-03-25" },
      { activity_id: "A1030", planned_finish: "2026-05-10" },
    ]);
    const slipped = slippedActivities(report);
    expect(slipped.map((r) => r.activity_id)).toEqual(["A1030", "A1020"]);
  });

  it("respects a threshold", () => {
    const report = computeVariance(BASE, [
      { activity_id: "A1020", planned_finish: "2026-03-25" },
    ]);
    expect(slippedActivities(report, calendarDays(10))).toHaveLength(0);
  });
});

/**
 * The mixed-unit row this type change exists to prevent.
 *
 * A 10-day activity finishing 14 days late puts a working-day duration beside
 * a calendar-day variance on one row. A reader compares them and concludes the
 * activity slipped by more than its own duration. These assert that the two
 * cannot be combined without something refusing.
 */
describe("units cannot be mixed silently", () => {
  it("refuses to add a working-day count to a calendar-day one", () => {
    expect(addDays(calendarDays(14), workingDays(10))).toBeNull();
  });

  it("adds two counts that share a basis", () => {
    expect(addDays(calendarDays(14), calendarDays(3))).toEqual({ value: 17, basis: "calendar" });
  });

  it("refuses to compare across bases", () => {
    expect(compareDays(calendarDays(14), workingDays(10))).toBeNull();
  });

  it("shows the basis when formatted, so a report cannot hide it", () => {
    expect(formatDays(calendarDays(14))).toBe("14 cd");
    expect(formatDays(workingDays(10))).toBe("10 wd");
  });

  it("does not filter calendar-day variances against a working-day threshold", () => {
    const report = {
      rows: [
        {
          activity_id: "A",
          activity: "A",
          baseline_start: null,
          baseline_finish: "2026-03-01",
          current_start: null,
          current_finish: "2026-03-15",
          start_variance: null,
          finish_variance: calendarDays(14),
        },
      ],
      missingFromCurrent: [],
      addedSinceBaseline: [],
    };
    // 14 calendar days IS greater than 10, so a bare-number implementation
    // would return the row. Mismatched bases must not silently compare.
    expect(slippedActivities(report, workingDays(10))).toHaveLength(0);
    expect(slippedActivities(report, calendarDays(10))).toHaveLength(1);
  });
});
