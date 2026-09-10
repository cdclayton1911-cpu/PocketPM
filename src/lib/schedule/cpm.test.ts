import { describe, expect, it } from "vitest";

import { computeCpm, criticalPath, type CpmActivity, type CpmRelationship } from "./cpm";
import type { ProjectCalendar } from "./calendar";

const MON_FRI: ProjectCalendar = { work_days: [1, 2, 3, 4, 5], holidays: [] };
/** 2026-01-05 is a Monday. */
const START = "2026-01-05";

function act(id: string, duration: number, over: Partial<CpmActivity> = {}): CpmActivity {
  return { id, duration_days: duration, ...over };
}
function rel(
  predecessor: string,
  successor: string,
  type: CpmRelationship["type"] = "FS",
  lag_days = 0,
): CpmRelationship {
  return { predecessor, successor, type, lag_days };
}

function run(
  activities: CpmActivity[],
  relationships: CpmRelationship[],
  calendar: ProjectCalendar = MON_FRI,
) {
  const outcome = computeCpm(activities, relationships, calendar, { projectStart: START });
  if (!outcome.ok) throw new Error(`cpm failed: ${outcome.error}`);
  const by = new Map(outcome.report.activities.map((a) => [a.id, a]));
  return { report: outcome.report, by };
}

describe("forward pass", () => {
  it("starts an unconstrained activity at the project start", () => {
    const { by } = run([act("A", 5)], []);
    expect(by.get("A")?.early_start).toBe(START);
    // 5 working days inclusive: Mon–Fri.
    expect(by.get("A")?.early_finish).toBe("2026-01-09");
  });

  it("skips weekends, so a 10-day activity does not finish on a Sunday", () => {
    const { by } = run([act("A", 10)], []);
    expect(by.get("A")?.early_finish).toBe("2026-01-16");
  });

  it("a milestone starts and finishes the same day", () => {
    const { by } = run([act("M", 0, { activity_type: "start_milestone" })], []);
    expect(by.get("M")?.early_start).toBe(by.get("M")?.early_finish);
  });

  it("treats a missing or zero duration as one day rather than zero", () => {
    // A zero-length non-milestone would let successors start the same day,
    // which silently compresses the schedule.
    const { by } = run([act("A", 0)], []);
    expect(by.get("A")?.early_finish).toBe(START);
  });
});

describe("relationship types", () => {
  it("FS starts the successor the working day after the predecessor finishes", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "FS")]);
    expect(by.get("A")?.early_finish).toBe("2026-01-09"); // Friday
    expect(by.get("B")?.early_start).toBe("2026-01-12"); // Monday, not Saturday
  });

  it("FS with lag pushes the successor by working days", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "FS", 2)]);
    expect(by.get("B")?.early_start).toBe("2026-01-14");
  });

  it("FS with negative lag (lead) pulls the successor earlier", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "FS", -2)]);
    expect(by.get("B")?.early_start).toBe("2026-01-08");
  });

  it("SS starts the successor with the predecessor", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "SS")]);
    expect(by.get("B")?.early_start).toBe(START);
  });

  it("SS with lag offsets from the predecessor's START, not its finish", () => {
    // The classic error: computing SS off the predecessor's finish. A 5-day
    // predecessor would put B on 2026-01-13 instead of 2026-01-07.
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "SS", 2)]);
    expect(by.get("B")?.early_start).toBe("2026-01-07");
  });

  it("FF constrains the successor's FINISH and backs out its start", () => {
    // B (3 days) must finish no earlier than A's finish (Fri 09), so B starts
    // Wed 07 — it cannot simply start when A finishes.
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "FF")]);
    expect(by.get("B")?.early_finish).toBe("2026-01-09");
    expect(by.get("B")?.early_start).toBe("2026-01-07");
  });

  it("FF with lag pushes the successor's finish", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "FF", 2)]);
    expect(by.get("B")?.early_finish).toBe("2026-01-13");
  });

  it("SF constrains the successor's finish from the predecessor's start", () => {
    const { by } = run([act("A", 5), act("B", 3)], [rel("A", "B", "SF", 4)]);
    // A starts Mon 05; +4 working days = Fri 09 is B's earliest finish.
    expect(by.get("B")?.early_finish).toBe("2026-01-09");
  });

  it("takes the latest bound when an activity has several predecessors", () => {
    const { by } = run(
      [act("A", 2), act("B", 8), act("C", 1)],
      [rel("A", "C"), rel("B", "C")],
    );
    // B finishes later, so it governs.
    expect(by.get("C")?.early_start).toBe("2026-01-15");
  });

  it("honours a mix of FS and FF predecessors on one activity", () => {
    const { by } = run(
      [act("A", 2), act("B", 10), act("C", 3)],
      [rel("A", "C", "FS"), rel("B", "C", "FF")],
    );
    // The FF bound (finish with B on 2026-01-16) is later than the FS bound.
    expect(by.get("C")?.early_finish).toBe("2026-01-16");
  });
});

describe("pinned actuals", () => {
  it("an actual start overrides the calculated early start", () => {
    const { by } = run([act("A", 5, { actual_start: "2026-01-07" })], []);
    expect(by.get("A")?.early_start).toBe("2026-01-07");
    expect(by.get("A")?.pinned_start).toBe(true);
  });

  it("successors compute from the pinned value, not from logic", () => {
    const { by } = run(
      [act("A", 5, { actual_start: "2026-01-12" }), act("B", 2)],
      [rel("A", "B")],
    );
    // A pinned to Mon 12, 5 days → Fri 16. B starts Mon 19.
    expect(by.get("A")?.early_finish).toBe("2026-01-16");
    expect(by.get("B")?.early_start).toBe("2026-01-19");
  });

  it("an actual finish overrides the calculated one, even if it disagrees with the duration", () => {
    // Work finished when it finished. A CPM that argued with the actual would
    // be telling the field it did not do what it did.
    const { by } = run([act("A", 5, { actual_start: START, actual_finish: "2026-01-07" })], []);
    expect(by.get("A")?.early_finish).toBe("2026-01-07");
    expect(by.get("A")?.pinned_finish).toBe(true);
  });

  it("marks unpinned activities as unpinned", () => {
    const { by } = run([act("A", 5)], []);
    expect(by.get("A")?.pinned_start).toBe(false);
    expect(by.get("A")?.pinned_finish).toBe(false);
  });
});

describe("backward pass and float", () => {
  it("puts a single chain entirely on the critical path", () => {
    const { by, report } = run(
      [act("A", 5), act("B", 5)],
      [rel("A", "B")],
    );
    expect(by.get("A")?.total_float).toEqual({ value: 0, basis: "working" });
    expect(by.get("B")?.total_float).toEqual({ value: 0, basis: "working" });
    expect(criticalPath(report)).toHaveLength(2);
  });

  it("gives float to a parallel path that is shorter", () => {
    // A(10) and B(2) both feed C. B has 8 working days of slack.
    const { by } = run(
      [act("A", 10), act("B", 2), act("C", 1)],
      [rel("A", "C"), rel("B", "C")],
    );
    expect(by.get("A")?.total_float).toEqual({ value: 0, basis: "working" });
    expect(by.get("B")?.total_float).toEqual({ value: 8, basis: "working" });
    expect(by.get("B")?.is_critical).toBe(false);
  });

  it("reports float in WORKING days, never a bare number", () => {
    const { by } = run([act("A", 5)], []);
    expect(by.get("A")?.total_float?.basis).toBe("working");
    expect(by.get("A")?.free_float?.basis).toBe("working");
  });

  it("free float is the slack before the nearest successor moves", () => {
    const { by } = run(
      [act("A", 10), act("B", 2), act("C", 1)],
      [rel("A", "C"), rel("B", "C")],
    );
    // B can slip 8 days before C's early start moves.
    expect(by.get("B")?.free_float).toEqual({ value: 8, basis: "working" });
    expect(by.get("A")?.free_float).toEqual({ value: 0, basis: "working" });
  });

  it("respects a critical threshold, since constrained schedules run negative", () => {
    const { by } = run([act("A", 10), act("B", 2), act("C", 1)], [rel("A", "C"), rel("B", "C")]);
    const outcome = computeCpm(
      [act("A", 10), act("B", 2), act("C", 1)],
      [rel("A", "C"), rel("B", "C")],
      MON_FRI,
      { projectStart: START, criticalThreshold: 8 },
    );
    expect(by.get("B")?.is_critical).toBe(false);
    if (outcome.ok) {
      expect(outcome.report.activities.find((a) => a.id === "B")?.is_critical).toBe(true);
    }
  });
});

describe("holidays", () => {
  it("pushes a finish past a holiday", () => {
    const cal: ProjectCalendar = {
      work_days: [1, 2, 3, 4, 5],
      holidays: [{ date: "2026-01-07", label: "Site closed" }],
    };
    const { by } = run([act("A", 5)], [], cal);
    // Wednesday lost, so the 5-day activity runs to Monday.
    expect(by.get("A")?.early_finish).toBe("2026-01-12");
  });
});

describe("refusals", () => {
  it("refuses a cycle rather than looping", () => {
    const outcome = computeCpm(
      [act("A", 1), act("B", 1)],
      [rel("A", "B"), rel("B", "A")],
      MON_FRI,
      { projectStart: START },
    );
    expect(outcome).toEqual({ ok: false, error: "cycle" });
  });

  it("refuses an empty schedule", () => {
    expect(computeCpm([], [], MON_FRI)).toEqual({ ok: false, error: "no_activities" });
  });

  it("refuses a calendar with no working days rather than emitting null dates", () => {
    const outcome = computeCpm([act("A", 1)], [], { work_days: [], holidays: [] });
    expect(outcome).toEqual({ ok: false, error: "no_working_days" });
  });

  it("ignores an edge pointing outside the activity set", () => {
    // A filtered view of one project is a legitimate input; half an edge is
    // not a cycle and must not fail the whole computation.
    const { by } = run([act("A", 5)], [rel("GHOST", "A")]);
    expect(by.get("A")?.early_start).toBe(START);
  });
});

describe("imported dates are never written", () => {
  it("leaves target_start and target_finish untouched in the input", () => {
    const activities = [act("A", 5, { target_start: "2020-01-01", target_finish: "2020-01-05" })];
    const { by } = run(activities, []);
    // The computed dates differ from the mirrored ones — which is the point:
    // the divergence stays visible instead of overwriting the source.
    expect(by.get("A")?.early_start).toBe(START);
    expect(activities[0].target_start).toBe("2020-01-01");
    expect(activities[0].target_finish).toBe("2020-01-05");
  });

  it("returns results without mutating the activities it was given", () => {
    const activities = [act("A", 5), act("B", 3)];
    const snapshot = JSON.stringify(activities);
    run(activities, [rel("A", "B")]);
    expect(JSON.stringify(activities)).toBe(snapshot);
  });
});
