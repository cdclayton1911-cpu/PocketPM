import { describe, expect, it } from "vitest";

import {
  computeVariance,
  daysBetween,
  slippedActivities,
  type BaselineRow,
  type CurrentRow,
} from "../variance";

const BASE: BaselineRow[] = [
  { activity_id: "A1010", activity: "Mobilize", start: "2026-03-02", finish: "2026-03-06" },
  { activity_id: "A1020", activity: "Excavate", start: "2026-03-09", finish: "2026-03-20" },
  { activity_id: "A1030", activity: "Foundations", start: "2026-03-23", finish: "2026-04-10" },
];

describe("daysBetween", () => {
  it("counts forward", () => expect(daysBetween("2026-03-02", "2026-03-06")).toBe(4));
  it("counts backward as negative", () => expect(daysBetween("2026-03-06", "2026-03-02")).toBe(-4));
  it("is null when a date is missing", () => expect(daysBetween("", "2026-03-06")).toBeNull());
  it("is null on an unparseable date", () => expect(daysBetween("March 2nd", "2026-03-06")).toBeNull());
  it("is unaffected by DST — dates are UTC-anchored", () => {
    // 2026-03-08 is a US DST transition; a local-time implementation returns 6.
    expect(daysBetween("2026-03-05", "2026-03-12")).toBe(7);
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
    expect(report.rows[0].finish_variance_days).toBe(0);
    expect(report.rows[1].start_variance_days).toBe(2);
    expect(report.rows[1].finish_variance_days).toBe(5);
  });

  it("prefers actual dates over planned — that is what current means", () => {
    const report = computeVariance(
      [{ activity_id: "X", start: "2026-01-01", finish: "2026-01-10" }],
      [{ activity_id: "X", planned_finish: "2026-01-10", actual_finish: "2026-01-18" }],
    );
    expect(report.rows[0].finish_variance_days).toBe(8);
  });

  it("falls back to forecast when there is no actual", () => {
    const report = computeVariance(
      [{ activity_id: "X", finish: "2026-01-10" }],
      [{ activity_id: "X", planned_finish: "2026-01-10", forecast_finish: "2026-01-15" }],
    );
    expect(report.rows[0].finish_variance_days).toBe(5);
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
    expect(report.rows[0].finish_variance_days).toBeNull();
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
    expect(slippedActivities(report, 10)).toHaveLength(0);
  });
});
