import { describe, expect, it } from "vitest";

import {
  barGeometry,
  buildScale,
  dateToX,
  nonWorkingSpans,
  PX_PER_DAY,
  scheduleBounds,
  startOfWeek,
  WEEK_WIDTH,
} from "./gantt-geometry";
import type { ProjectCalendar } from "./calendar";

const MON_FRI: ProjectCalendar = { work_days: [1, 2, 3, 4, 5], holidays: [] };

describe("startOfWeek", () => {
  it("snaps back to Monday", () => {
    // 2026-01-08 is a Thursday.
    expect(startOfWeek("2026-01-08")).toBe("2026-01-05");
  });

  it("leaves a Monday alone", () => {
    expect(startOfWeek("2026-01-05")).toBe("2026-01-05");
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // getUTCDay puts Sunday at 0; a naive offset would jump forward six days.
    expect(startOfWeek("2026-01-11")).toBe("2026-01-05");
  });

  it("is null for an unreadable date", () => {
    expect(startOfWeek("nope")).toBeNull();
  });
});

describe("buildScale", () => {
  it("covers a single week", () => {
    const scale = buildScale("2026-01-05", "2026-01-09");
    expect(scale?.weeks).toHaveLength(1);
    expect(scale?.width).toBe(WEEK_WIDTH);
  });

  it("spans a four-year job in a scrollable number of columns", () => {
    // The Charleston Airport case: 2026-09 to 2030-12. Weekly keeps this near
    // 220 columns; daily would be about 1,550 and need virtualisation.
    const scale = buildScale("2026-09-01", "2030-12-05");
    expect(scale).not.toBeNull();
    expect(scale!.weeks.length).toBeGreaterThan(200);
    expect(scale!.weeks.length).toBeLessThan(240);
  });

  it("labels the first column of each month once", () => {
    const scale = buildScale("2026-01-05", "2026-03-31")!;
    const labelled = scale.weeks.filter((w) => w.monthLabel);
    expect(labelled.length).toBe(3);
    expect(labelled[0].monthLabel).toContain("Jan");
  });

  it("places columns one week apart", () => {
    const scale = buildScale("2026-01-05", "2026-01-26")!;
    expect(scale.weeks.map((w) => w.x)).toEqual([0, WEEK_WIDTH, WEEK_WIDTH * 2, WEEK_WIDTH * 3]);
  });

  it("returns null rather than inventing a range from bad dates", () => {
    expect(buildScale("nope", "2026-01-05")).toBeNull();
    expect(buildScale("2026-01-05", "nope")).toBeNull();
  });

  it("returns null when the end precedes the start", () => {
    expect(buildScale("2026-06-01", "2026-01-01")).toBeNull();
  });
});

describe("dateToX", () => {
  const scale = buildScale("2026-01-05", "2026-03-01")!;

  it("puts the scale start at zero", () => {
    expect(dateToX(scale, "2026-01-05")).toBe(0);
  });

  it("advances one week per week", () => {
    expect(dateToX(scale, "2026-01-12")).toBe(WEEK_WIDTH);
  });

  it("goes negative for a date before the scale, rather than clamping", () => {
    // Clamping would silently draw an out-of-range activity at the left edge,
    // which reads as "starts on day one" instead of "is off the chart".
    expect(dateToX(scale, "2026-01-04")).toBeLessThan(0);
  });
});

describe("barGeometry", () => {
  const scale = buildScale("2026-01-05", "2026-06-01")!;

  it("makes a one-day activity one day wide, not zero", () => {
    const bar = barGeometry(scale, { planned_start: "2026-01-05", planned_finish: "2026-01-05" });
    expect(bar.kind).toBe("bar");
    expect(bar.width).toBe(PX_PER_DAY);
  });

  it("includes both endpoints", () => {
    // Mon to Fri is five days, not four.
    const bar = barGeometry(scale, { planned_start: "2026-01-05", planned_finish: "2026-01-09" });
    expect(bar.width).toBe(5 * PX_PER_DAY);
  });

  it("renders a milestone as a marker with no width", () => {
    const bar = barGeometry(scale, {
      planned_start: "2026-01-07",
      planned_finish: "2026-01-07",
      is_milestone: true,
    });
    expect(bar.kind).toBe("milestone");
    expect(bar.width).toBe(0);
  });

  it("treats a zero-duration non-milestone as one day", () => {
    const bar = barGeometry(scale, { planned_start: "2026-01-07", planned_finish: "2026-01-07" });
    expect(bar.kind).toBe("bar");
    expect(bar.width).toBe(PX_PER_DAY);
  });

  it("draws nothing when an activity has no dates at all", () => {
    // An import can legitimately carry activities with no dates; drawing them
    // at the origin would put them on the chart's first day.
    const bar = barGeometry(scale, {});
    expect(bar.kind).toBe("none");
    expect(bar.reason).toBe("no dates");
  });

  it("uses the finish when only a finish is present", () => {
    expect(barGeometry(scale, { planned_finish: "2026-02-02" }).kind).toBe("bar");
  });

  it("never produces a negative width from a finish before its start", () => {
    const bar = barGeometry(scale, { planned_start: "2026-02-10", planned_finish: "2026-02-01" });
    expect(bar.width).toBeGreaterThan(0);
  });

  it("draws nothing for an unreadable date", () => {
    expect(barGeometry(scale, { planned_start: "the third" }).kind).toBe("none");
  });
});

describe("nonWorkingSpans", () => {
  it("merges each weekend into one span rather than two rects", () => {
    const scale = buildScale("2026-01-05", "2026-01-18")!;
    const spans = nonWorkingSpans(scale, MON_FRI);
    expect(spans).toHaveLength(2);
    expect(spans[0].width).toBe(2 * PX_PER_DAY);
  });

  it("merges a holiday adjoining a weekend into a single closure", () => {
    // Friday 2026-01-09 off, then Sat and Sun: one three-day closure, which is
    // what it looks like on site, not a holiday next to a weekend.
    const cal: ProjectCalendar = { work_days: [1, 2, 3, 4, 5], holidays: [{ date: "2026-01-09" }] };
    const scale = buildScale("2026-01-05", "2026-01-11")!;
    const spans = nonWorkingSpans(scale, cal);
    expect(spans).toHaveLength(1);
    expect(spans[0].width).toBe(3 * PX_PER_DAY);
  });

  it("keeps the count manageable across a long job", () => {
    const scale = buildScale("2026-09-01", "2030-12-05")!;
    const spans = nonWorkingSpans(scale, MON_FRI);
    // About one per weekend, not one per non-working day.
    expect(spans.length).toBeLessThan(300);
  });

  it("returns one continuous span when nothing is ever worked", () => {
    const scale = buildScale("2026-01-05", "2026-01-11")!;
    expect(nonWorkingSpans(scale, { work_days: [], holidays: [] })).toHaveLength(1);
  });
});

describe("scheduleBounds", () => {
  it("spans the earliest and latest activity dates", () => {
    const bounds = scheduleBounds([
      { planned_start: "2026-03-01", planned_finish: "2026-03-10" },
      { planned_start: "2026-01-05", planned_finish: "2026-01-09" },
    ]);
    expect(bounds).toEqual({ from: "2026-01-05", to: "2026-03-10" });
  });

  it("falls back to the project span when no activity has a date", () => {
    expect(scheduleBounds([{}], "2026-09-01", "2027-09-01")).toEqual({
      from: "2026-09-01",
      to: "2027-09-01",
    });
  });

  it("is null when there is nothing to draw and no fallback", () => {
    expect(scheduleBounds([{}])).toBeNull();
  });
});
