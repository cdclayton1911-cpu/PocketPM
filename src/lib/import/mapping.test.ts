import { describe, expect, it } from "vitest";

import { parseDateCell } from "./dates";
import { buildDryRun } from "./dryrun";
import { guessMapping, mapRows, parsePredecessorToken, unmappedColumns } from "./mapping";

describe("ambiguous dates", () => {
  it("reads the same cell two different ways depending on the order chosen", () => {
    // The whole reason the toggle exists: nothing in the file distinguishes
    // these, and picking one silently shifts a schedule by up to 11 months.
    expect(parseDateCell("03/04/2026", "day-first").value).toBe("2026-04-03");
    expect(parseDateCell("03/04/2026", "month-first").value).toBe("2026-03-04");
  });

  it("marks a cell as ambiguous only when both readings are valid", () => {
    expect(parseDateCell("03/04/2026", "day-first").ambiguous).toBe(true);
    // 25 cannot be a month, so there is nothing to be ambiguous about.
    expect(parseDateCell("25/04/2026", "day-first").ambiguous).toBeFalsy();
  });

  it("ignores the order for ISO input, which is unambiguous", () => {
    expect(parseDateCell("2026-03-04", "day-first").value).toBe("2026-03-04");
    expect(parseDateCell("2026-03-04", "month-first").value).toBe("2026-03-04");
  });

  it("ignores the order for a named month", () => {
    expect(parseDateCell("04-Mar-2026", "month-first").value).toBe("2026-03-04");
  });

  it("refuses 31 February rather than rolling into March", () => {
    expect(parseDateCell("31/02/2026", "day-first").value).toBeNull();
  });

  it("explains when a date is impossible in the chosen order", () => {
    const parsed = parseDateCell("13/04/2026", "month-first");
    expect(parsed.value).toBeNull();
    expect(parsed.problem).toMatch(/order/);
  });

  it("keeps the raw cell alongside, so the preview can show both", () => {
    expect(parseDateCell("03/04/2026", "day-first").raw).toBe("03/04/2026");
  });
});

describe("predecessor syntax", () => {
  it("defaults a bare id to FS with no lag", () => {
    expect(parsePredecessorToken("A100")).toMatchObject({ activity_id: "A100", type: "FS", lag_days: 0 });
  });

  it("reads a type suffix", () => {
    expect(parsePredecessorToken("A100SS")).toMatchObject({ activity_id: "A100", type: "SS" });
  });

  it("reads a positive and a negative lag", () => {
    expect(parsePredecessorToken("A100FS+2")).toMatchObject({ activity_id: "A100", type: "FS", lag_days: 2 });
    expect(parsePredecessorToken("A100SS-1")).toMatchObject({ activity_id: "A100", type: "SS", lag_days: -1 });
  });

  it("tolerates spacing and a days suffix", () => {
    expect(parsePredecessorToken("A100 FS + 2d")).toMatchObject({ activity_id: "A100", type: "FS", lag_days: 2 });
  });

  it("does not eat a type-like suffix that is part of the id", () => {
    // Lag is stripped first, then the type, then whatever remains is the id —
    // so an activity genuinely called "100FS" keeps its name.
    expect(parsePredecessorToken("100FS")).toMatchObject({ activity_id: "100", type: "FS" });
    expect(parsePredecessorToken("A100")).toMatchObject({ activity_id: "A100" });
  });
});

describe("header guessing", () => {
  it("maps common header spellings", () => {
    const mapping = guessMapping(["Activity ID", "Description", "Start", "Finish", "Predecessors"]);
    expect(mapping.activity_id).toBe(0);
    expect(mapping.activity).toBe(1);
    expect(mapping.planned_start).toBe(2);
    expect(mapping.planned_finish).toBe(3);
    expect(mapping.predecessors).toBe(4);
  });

  it("never claims one column for two fields", () => {
    const mapping = guessMapping(["Name", "Name"]);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it("lists columns nothing claimed", () => {
    const headers = ["Activity ID", "Resource", "Cost Code"];
    expect(unmappedColumns(headers, guessMapping(headers))).toEqual(["Resource", "Cost Code"]);
  });
});

const HEADERS = ["Activity ID", "Description", "Start", "Finish", "Predecessors"];
const MAPPING = { activity_id: 0, activity: 1, planned_start: 2, planned_finish: 3, predecessors: 4 };

function map(rows: string[][], order: "day-first" | "month-first" = "day-first") {
  return mapRows(HEADERS, rows, rows.map((_, i) => i + 2), MAPPING, order);
}

describe("row mapping", () => {
  it("refuses a row with no activity id, naming the row", () => {
    const result = map([["", "Slab", "01/03/2026", "05/03/2026", ""]]);
    expect(result.activities).toHaveLength(0);
    expect(result.problems[0]).toMatchObject({ rowNumber: 2, field: "activity_id", severity: "error" });
  });

  it("errors on a finish before its start", () => {
    const result = map([["A1", "Slab", "05/03/2026", "01/03/2026", ""]]);
    expect(result.problems.some((p) => p.severity === "error" && /before start/.test(p.message))).toBe(true);
  });

  it("warns rather than failing when an activity has no dates at all", () => {
    const result = map([["A1", "Slab", "", "", ""]]);
    expect(result.activities).toHaveLength(1);
    expect(result.problems[0].severity).toBe("warning");
  });
});

describe("the dry run", () => {
  const base = (activities: ReturnType<typeof map>["activities"], problems = [] as never[]) =>
    buildDryRun({
      encoding: "utf-8",
      encodingGuessed: true,
      delimiter: ",",
      headers: HEADERS,
      unmapped: [],
      activities,
      problems,
      skipped: 0,
      baselines: [],
    });

  it("catches a duplicate activity id and names both rows", () => {
    const { activities } = map([
      ["A1", "Slab", "01/03/2026", "05/03/2026", ""],
      ["A1", "Slab again", "06/03/2026", "09/03/2026", ""],
    ]);
    const report = base(activities);
    expect(report.duplicateActivityIds).toEqual([{ activity_id: "A1", rowNumbers: [2, 3] }]);
    expect(report.canImport).toBe(false);
  });

  it("catches a predecessor that is not in the file", () => {
    const { activities } = map([["A2", "Walls", "01/03/2026", "05/03/2026", "A1"]]);
    const report = base(activities);
    expect(report.danglingPredecessors).toEqual([{ rowNumber: 2, activity_id: "A2", reference: "A1" }]);
    expect(report.canImport).toBe(false);
  });

  it("refuses a cycle before anything is written", () => {
    const { activities } = map([
      ["A1", "One", "01/03/2026", "05/03/2026", "A2"],
      ["A2", "Two", "06/03/2026", "09/03/2026", "A1"],
    ]);
    const report = base(activities);
    expect(report.cycle).toMatch(/loop/);
    expect(report.canImport).toBe(false);
  });

  it("counts relationships that will actually be created", () => {
    const { activities } = map([
      ["A1", "One", "01/03/2026", "05/03/2026", ""],
      ["A2", "Two", "06/03/2026", "09/03/2026", "A1FS+2"],
    ]);
    expect(base(activities).counts).toMatchObject({ activities: 2, relationships: 1 });
  });

  it("lets warnings through but not errors", () => {
    const { activities, problems } = map([["A1", "Slab", "", "", ""]]);
    const report = base(activities, problems as never[]);
    expect(report.counts.warnings).toBe(1);
    expect(report.canImport).toBe(true);
  });
});

/**
 * The report that matters most.
 *
 * Baseline items join to activities by activity_id STRING so a baseline
 * survives re-import. The cost is that a renumbered activity silently detaches
 * its baseline item, and a baseline matching nothing reports NO VARIANCE —
 * which on a delay claim is the most misleading answer available, and is
 * invisible: the schedule looks fine and the variance report is simply empty.
 */
describe("baseline-match report", () => {
  const withBaseline = (activityIds: string[], baselineIds: string[]) => {
    const rows = activityIds.map((id, i) => [id, `Task ${i}`, "01/03/2026", "05/03/2026", ""]);
    const { activities } = map(rows);
    return buildDryRun({
      encoding: "utf-8",
      encodingGuessed: false,
      delimiter: ",",
      headers: HEADERS,
      unmapped: [],
      activities,
      problems: [],
      skipped: 0,
      baselines: [{ id: "b1", name: "As-planned", itemActivityIds: baselineIds }],
    });
  };

  it("reports every baseline item still matching after import", () => {
    const report = withBaseline(["A1", "A2", "A3"], ["A1", "A2", "A3"]);
    expect(report.baselines[0]).toMatchObject({ totalItems: 3, willMatch: 3, willOrphan: 0 });
  });

  it("counts the items a renumbering would orphan", () => {
    // The schedule was renumbered A1..A3 → B1..B3. Nothing errors, the import
    // looks clean, and the as-planned baseline stops matching entirely.
    const report = withBaseline(["B1", "B2", "B3"], ["A1", "A2", "A3"]);
    expect(report.baselines[0]).toMatchObject({ totalItems: 3, willMatch: 0, willOrphan: 3 });
    expect(report.baselines[0].orphanedSample).toEqual(["A1", "A2", "A3"]);
  });

  it("counts a partial orphaning", () => {
    const report = withBaseline(["A1", "A2"], ["A1", "A2", "A3"]);
    expect(report.baselines[0]).toMatchObject({ willMatch: 2, willOrphan: 1 });
  });

  it("does not block the import — it is the user's call, but an informed one", () => {
    const report = withBaseline(["B1"], ["A1"]);
    expect(report.canImport).toBe(true);
    expect(report.baselines[0].willOrphan).toBe(1);
  });
});
