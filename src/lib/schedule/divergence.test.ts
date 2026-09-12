import { describe, expect, it } from "vitest";

import { computeCpm, type CpmActivity, type CpmRelationship } from "./cpm";
import { computeDivergence, DEFAULT_THRESHOLDS, type DivergenceInput } from "./divergence";
import type { ProjectCalendar } from "./calendar";

const MON_FRI: ProjectCalendar = { work_days: [1, 2, 3, 4, 5], holidays: [] };
const START = "2026-01-05"; // Monday

function cpm(activities: CpmActivity[], relationships: CpmRelationship[]) {
  const outcome = computeCpm(activities, relationships, MON_FRI, { projectStart: START });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.report.activities;
}

/**
 * The hand-derived case.
 *
 * A: 5 days from Mon 2026-01-05 → finishes Fri 2026-01-09.
 * B: FS successor, 3 days → logic says it starts Mon 2026-01-12.
 *
 * But the imported schedule says B starts 2026-01-19. P6 is holding a
 * start-no-earlier-than we have no field for. 2026-01-12 to 2026-01-19 is
 * SEVEN calendar days — derived from the dates, not read off the output.
 */
describe("a constrained activity produces a known divergence", () => {
  const activities: Array<CpmActivity & DivergenceInput> = [
    { id: "a", duration_days: 5, source_early_start: START, source_early_finish: "2026-01-09" },
    { id: "b", duration_days: 3, source_early_start: "2026-01-19", source_early_finish: "2026-01-21" },
  ];
  const rels: CpmRelationship[] = [{ predecessor: "a", successor: "b", type: "FS", lag_days: 0 }];

  it("reports the delta between logic and the source", () => {
    const report = computeDivergence(activities, cpm(activities, rels));
    const b = report.rows.find((r) => r.id === "b");
    expect(b?.computed_start).toBe("2026-01-12");
    expect(b?.imported_start).toBe("2026-01-19");
    expect(b?.start_delta).toEqual({ value: 7, basis: "calendar" });
  });

  it("flags it as likely constrained, because the source holds it LATER", () => {
    const report = computeDivergence(activities, cpm(activities, rels));
    expect(report.likelyConstrained.map((r) => r.id)).toEqual(["b"]);
  });

  it("leaves the unconstrained activity clean", () => {
    const report = computeDivergence(activities, cpm(activities, rels));
    const a = report.rows.find((r) => r.id === "a");
    expect(a?.start_delta).toEqual({ value: 0, basis: "calendar" });
    expect(a?.magnitude).toBe("none");
    expect(a?.likely_constrained).toBe(false);
  });

  it("bands seven days as notable, not severe", () => {
    const report = computeDivergence(activities, cpm(activities, rels));
    expect(report.rows.find((r) => r.id === "b")?.magnitude).toBe("notable");
    expect(report.counts).toEqual({ none: 1, minor: 0, notable: 1, severe: 0 });
  });
});

describe("direction matters", () => {
  const base: Array<CpmActivity & DivergenceInput> = [{ id: "a", duration_days: 5, source_early_start: START, source_early_finish: "2026-01-09" }];

  it("an imported date EARLIER than logic is not a constraint", () => {
    // Our logic being more restrictive than the source usually means a missing
    // or wrong relationship, which is a different problem with a different fix.
    const items = [{ ...base[0], source_early_start: "2025-12-01", source_early_finish: "2025-12-05" }];
    const report = computeDivergence(items, cpm(base, []));
    const row = report.rows[0];
    expect(row.start_delta?.value).toBeLessThan(0);
    expect(row.likely_constrained).toBe(false);
    expect(row.magnitude).toBe("severe");
  });

  it("deltas are calendar days, so they cannot be read as float", () => {
    const items = [{ ...base[0], source_early_start: "2026-01-12", source_early_finish: "2026-01-16" }];
    const report = computeDivergence(items, cpm(base, []));
    expect(report.rows[0].start_delta?.basis).toBe("calendar");
  });
});

describe("progress and gaps", () => {
  it("does not flag an activity whose divergence comes from actual progress", () => {
    // A pinned activity diverges because it really started when it started.
    // Calling that a suspected constraint would bury the real ones.
    const activities: Array<CpmActivity & DivergenceInput> = [
      { id: "a", duration_days: 5, source_early_start: START, source_early_finish: "2026-01-09", actual_start: "2026-01-19" },
    ];
    const report = computeDivergence(activities, cpm(activities, []));
    expect(report.rows[0].pinned).toBe(true);
    expect(report.rows[0].likely_constrained).toBe(false);
  });

  it("reports an activity missing from the CPM result rather than dropping it", () => {
    const report = computeDivergence(
      [{ id: "ghost", activity_id: "GH-1", source_early_start: START }],
      [],
    );
    expect(report.unmatched).toEqual(["GH-1"]);
    expect(report.rows).toHaveLength(0);
  });

  it("is silent when an imported date is absent", () => {
    const activities: Array<CpmActivity & DivergenceInput> = [{ id: "a", duration_days: 5 }];
    const report = computeDivergence(activities, cpm(activities, []));
    expect(report.rows[0].start_delta).toBeNull();
    expect(report.rows[0].magnitude).toBe("none");
  });

  it("bands on the worse of start and finish", () => {
    // A start that agrees and a finish a fortnight out is not minor.
    const activities: Array<CpmActivity & DivergenceInput> = [
      { id: "a", duration_days: 5, source_early_start: START, source_early_finish: "2026-01-30" },
    ];
    const report = computeDivergence(activities, cpm(activities, []));
    expect(report.rows[0].start_delta?.value).toBe(0);
    expect(report.rows[0].magnitude).toBe("severe");
  });
});

describe("every difference carries a cause", () => {
  const rels: CpmRelationship[] = [{ predecessor: "a", successor: "b", type: "FS", lag_days: 0 }];
  // b's logic start is Mon 12; the source holds it to Mon 19.
  const held = (over: Partial<CpmActivity & DivergenceInput> = {}): Array<CpmActivity & DivergenceInput> => [
    { id: "a", duration_days: 5, source_early_start: START, source_early_finish: "2026-01-09" },
    { id: "b", duration_days: 3, source_early_start: "2026-01-19", source_early_finish: "2026-01-21", ...over },
  ];

  it("names a constraint the pass does not apply", () => {
    const acts = held({ constraint_type: "start_on_or_after" });
    const report = computeDivergence(acts, cpm(acts, rels));
    const b = report.rows.find((r) => r.id === "b");
    expect(b?.cause).toBe("constraint_not_applied");
    expect(b?.constraint_type).toBe("start_on_or_after");
    expect(report.unexplained).toHaveLength(0);
    expect(report.causes).toEqual({ actual_progress: 0, constraint_not_applied: 1, unexplained: 0 });
  });

  it("calls a difference with no known cause unexplained", () => {
    const acts = held();
    const report = computeDivergence(acts, cpm(acts, rels));
    expect(report.unexplained.map((r) => r.id)).toEqual(["b"]);
    expect(report.rows.find((r) => r.id === "b")?.cause).toBe("unexplained");
  });

  it("does not let as-late-as-possible explain a difference, because the pass applies it", () => {
    // b has no successors and sets the project finish, so ALAP cannot move it:
    // the seven days stay, and nothing on record accounts for them.
    const acts = held({ constraint_type: "as_late_as_possible" });
    const report = computeDivergence(acts, cpm(acts, rels));
    expect(report.rows.find((r) => r.id === "b")?.cause).toBe("unexplained");
  });

  it("attributes a pinned difference to actual progress", () => {
    const acts = held({ actual_start: "2026-01-19", source_early_start: "2026-01-26", source_early_finish: "2026-01-28" });
    const report = computeDivergence(acts, cpm(acts, rels));
    expect(report.rows.find((r) => r.id === "b")?.cause).toBe("actual_progress");
  });

  it("gives no cause where nothing differs", () => {
    const acts = held();
    const report = computeDivergence(acts, cpm(acts, rels));
    expect(report.rows.find((r) => r.id === "a")?.cause).toBeNull();
  });

  it("lists level of effort as excluded: not a row, and not unmatched", () => {
    const acts: Array<CpmActivity & DivergenceInput> = [
      { id: "a", duration_days: 5, source_early_start: START },
      { id: "l", activity_id: "LOE-1", activity_type: "level_of_effort", duration_days: 20, source_early_start: START },
    ];
    const report = computeDivergence(acts, cpm(acts, []));
    expect(report.excluded).toEqual(["LOE-1"]);
    expect(report.rows.map((r) => r.id)).toEqual(["a"]);
    expect(report.unmatched).toEqual([]);
  });
});

describe("thresholds", () => {
  it("are configurable, since tolerance differs by schedule", () => {
    const activities: Array<CpmActivity & DivergenceInput> = [
      { id: "a", duration_days: 5, source_early_start: "2026-01-07", source_early_finish: "2026-01-09" },
    ];
    const results = cpm(activities, []);
    expect(computeDivergence(activities, results).rows[0].magnitude).toBe("minor");
    expect(
      computeDivergence(activities, results, { ...DEFAULT_THRESHOLDS, minor: 5 }).rows[0].magnitude,
    ).toBe("none");
  });
});
