import { describe, expect, it } from "vitest";

import { guessMapping, mapRows, parseActivityTypeCell, TARGET_FIELDS } from "./mapping";
import { previewImport } from "./preview";

describe("activity_type replaces is_milestone", () => {
  it("is the mappable field, and is_milestone is gone", () => {
    expect(TARGET_FIELDS).toContain("activity_type");
    expect(TARGET_FIELDS as readonly string[]).not.toContain("is_milestone");
  });

  it("reads P6's own labels as a spreadsheet export writes them", () => {
    expect(parseActivityTypeCell("Task Dependent").value).toBe("task");
    expect(parseActivityTypeCell("Resource Dependent").value).toBe("task");
    expect(parseActivityTypeCell("Start Milestone").value).toBe("start_milestone");
    expect(parseActivityTypeCell("Finish Milestone").value).toBe("finish_milestone");
    expect(parseActivityTypeCell("Level of Effort").value).toBe("level_of_effort");
    expect(parseActivityTypeCell("finish_milestone").value).toBe("finish_milestone");
  });

  it("reads a yes/no milestone column, yes being a start milestone", () => {
    expect(parseActivityTypeCell("Y").value).toBe("start_milestone");
    expect(parseActivityTypeCell("no").value).toBe("task");
    expect(parseActivityTypeCell("").value).toBe("task");
  });

  it("reads a WBS summary as level of effort, and says so", () => {
    const { activities, problems } = mapRows(
      ["ID", "Activity Type"],
      [["A100", "WBS Summary"]],
      [2],
      { activity_id: 0, activity_type: 1 },
      "month-first",
    );
    expect(activities[0].activity_type).toBe("level_of_effort");
    // The row has no dates either, so "cannot be scheduled" is warned too.
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", field: "activity_type", message: expect.stringMatching(/WBS summary/) }),
      ]),
    );
    expect(problems.every((p) => p.severity === "warning")).toBe(true);
  });

  it("refuses a value it cannot read, naming the value", () => {
    const { problems } = mapRows(["ID", "Type"], [["A100", "Hammock"]], [2], { activity_id: 0, activity_type: 1 }, "month-first");
    expect(problems[0]).toMatchObject({ severity: "error", field: "activity_type" });
    expect(problems[0].message).toContain('"Hammock"');
  });

  it("guesses the column from P6's header and from a Milestone column", () => {
    expect(guessMapping(["Activity ID", "Activity Type"]).activity_type).toBe(1);
    expect(guessMapping(["ID", "Milestone"]).activity_type).toBe(1);
  });

  it("imports an unmapped type as a task", () => {
    const { activities } = mapRows(["ID"], [["A100"]], [2], { activity_id: 0 }, "month-first");
    expect(activities[0].activity_type).toBe("task");
  });
});

describe("the refusal under the import button", () => {
  // Synthetic: three tables in P6's layout. No real schedule data.
  const XER = [
    "ERMHDR\t20.12\t2023-07-28\tProject",
    "%T\tCURRTYPE",
    "%F\tcurr_id",
    "%R\t1",
    "%T\tTASK",
    "%F\ttask_id\ttask_code",
    "%R\t1\tA100",
    "%T\tTASKPRED",
    "%F\ttask_pred_id",
    "%R\t1",
    "%E",
    "",
  ].join("\n");

  it("summarises the file error instead of repeating it, and still names the reason", () => {
    const out = previewImport({ bytes: new TextEncoder().encode(XER), rawMapping: null, rawOrder: null, baselines: [] });
    if (!out.ok) throw new Error(out.message);
    const listed = out.report.problems.filter((p) => p.rowNumber === 0).map((p) => p.message);
    expect(listed[0]).toMatch(/3 tables/);
    expect(out.report.refusal).toBeTruthy();
    expect(listed).not.toContain(out.report.refusal);
    expect(out.report.refusal).toMatch(/XER/);
  });
});
