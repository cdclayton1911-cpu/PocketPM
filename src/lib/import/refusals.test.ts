import { describe, expect, it } from "vitest";

import { importPreviewSchema } from "@/lib/validation/schedule-import";

import { readCsv } from "./csv";
import { buildDryRun } from "./dryrun";
import {
  assignColumn,
  duplicateColumns,
  guessMapping,
  TARGET_FIELDS,
  type ColumnMapping,
} from "./mapping";
import { previewImport } from "./preview";
import { detectUnsupportedShape } from "./shape";

const bytes = (s: string) => new TextEncoder().encode(s);

/**
 * A flattened multi-table P6 export.
 *
 * SYNTHETIC. Shaped like the real XER that exposed these bugs — the ERMHDR
 * line, %T/%F/%R markers, an OBS root called "Enterprise", CRLF endings — but
 * containing none of it. That file is a client document and is never committed.
 */
const FLATTENED_XER = [
  "ERMHDR,22.12,2023-07-19,Project,ADMIN,admin,dbxDatabaseNoName,Project Management,USD",
  "%T,CURRTYPE",
  "%F,curr_id,curr_symbol,curr_short_name",
  "%R,1,$,USD",
  "%T,OBS",
  "%F,obs_id,obs_name",
  "%R,540,Enterprise",
  "%T,TASK",
  "%F,task_id,task_code,task_name,target_start_date,target_end_date",
  "%R,1,A1000,Mobilize,2023-01-02 08:00,2023-01-06 17:00",
  "%R,2,A1010,Excavate,2023-01-09 08:00,2023-01-20 17:00",
  "%T,TASKPRED",
  "%F,task_pred_id,task_id,pred_task_id,pred_type,lag_hr_cnt",
  "%R,1,2,1,PR_FS,0",
  "%E",
].join("\r\n");

const SCHEDULE_CSV = [
  "Activity ID,Description,Start,Finish,Predecessors",
  "A1,Mobilize,01/02/2026,01/06/2026,",
  "A2,Excavate,01/07/2026,01/20/2026,A1",
].join("\n");

const preview = (text: string, rawMapping: string | null = null) =>
  previewImport({ bytes: bytes(text), rawMapping, rawOrder: "month-first", baselines: [] });

describe("a column maps to at most one field", () => {
  it("leaves every field blank when no header matches, rather than reusing a column", () => {
    const { headers } = readCsv(bytes(FLATTENED_XER));
    expect(guessMapping(headers)).toEqual({});
  });

  it("moves a column when it is chosen for a second field", () => {
    expect(assignColumn({ activity_id: 0, activity: 1 }, "notes", 0)).toEqual({ activity: 1, notes: 0 });
  });

  it("clears a field set to not imported", () => {
    expect(assignColumn({ activity_id: 0, activity: 1 }, "activity", null)).toEqual({ activity_id: 0 });
  });

  it("never produces a shared column, whatever order the choices are made in", () => {
    let mapping: ColumnMapping = {};
    TARGET_FIELDS.forEach((field, i) => {
      mapping = assignColumn(mapping, field, i % 3);
    });
    expect(duplicateColumns(mapping)).toEqual([]);
    expect(Object.keys(mapping)).toHaveLength(3);
  });

  it("is refused by the schema when every field points at one column", () => {
    // The reported symptom: all fifteen dropdowns on one column. However a
    // client came to send it, the server does not accept it.
    const allOnOne = Object.fromEntries(TARGET_FIELDS.map((f) => [f, 0]));
    const parsed = importPreviewSchema.safeParse({ mapping: allOnOne, order: "month-first" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toMatch(/activity_id, activity, target_start and \d+ other fields/);
    }
  });

  it("is refused by the preview with the header named, not a bare 'invalid mapping'", () => {
    const allOnOne = JSON.stringify(Object.fromEntries(TARGET_FIELDS.map((f) => [f, 0])));
    const outcome = preview(SCHEDULE_CSV, allOnOne);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/^"Activity ID" is mapped to activity_id, activity/);
  });
});

describe("a refused import says why", () => {
  it("names a flattened P6 export as the problem", () => {
    const outcome = preview(FLATTENED_XER);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report.canImport).toBe(false);
    expect(outcome.report.problems[0].message).toMatch(/Primavera P6 XER export/);
    expect(outcome.report.problems[0].message).toMatch(/TASK/);
    expect(outcome.report.refusal).toMatch(/XER import is not supported yet/);
  });

  it("does the same when the XER was only renamed, still tab-separated", () => {
    const outcome = preview(FLATTENED_XER.replace(/,/g, "\t"));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report.refusal).toMatch(/Primavera P6 XER export/);
  });

  it("gives one reason, not a copy per line", () => {
    // Mapped as a schedule, the real file produced 4,992 identical "No
    // activity ID" errors: every one true, none of them the reason.
    const outcome = preview(FLATTENED_XER);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report.counts.errors).toBe(1);
  });

  it("does not flag an ordinary schedule CSV", () => {
    // The positive control: a detector that refused everything would pass
    // every assertion above.
    const table = readCsv(bytes(SCHEDULE_CSV));
    expect(detectUnsupportedShape(table.headers, table.rows)).toBeNull();
    const outcome = preview(SCHEDULE_CSV);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report.canImport).toBe(true);
    expect(outcome.report.refusal).toBeNull();
  });

  it("explains a refusal that has no row errors — the 'fix the errors above' over nothing", () => {
    const report = buildDryRun({
      encoding: "utf-8",
      encodingGuessed: true,
      delimiter: ",",
      headers: ["Activity ID"],
      unmapped: [],
      activities: [],
      problems: [],
      skipped: 0,
      baselines: [],
    });
    expect(report.canImport).toBe(false);
    expect(report.problems).toHaveLength(1);
    expect(report.refusal).toMatch(/no rows beneath it/);
  });

  it("gives one reason when activity_id is not mapped, not one per row", () => {
    const outcome = preview(SCHEDULE_CSV, JSON.stringify({ activity: 1 }));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.report.counts.errors).toBe(1);
    expect(outcome.report.refusal).toMatch(/No column is mapped to activity_id/);
  });

  it("never refuses without a reason", () => {
    const refused = [
      preview(FLATTENED_XER),
      preview("Activity ID,Description\n"),
      preview(SCHEDULE_CSV, JSON.stringify({ activity: 1 })),
      preview("Activity ID,Description,Start,Finish,Predecessors\nA1,One,,,A2\nA2,Two,,,A1"),
      preview("Activity ID,Description\nA1,One\nA1,Again"),
    ];
    for (const outcome of refused) {
      if (!outcome.ok) throw new Error(outcome.message);
      expect(outcome.report.canImport).toBe(false);
      expect(outcome.report.refusal).toBeTruthy();
      expect(outcome.report.problems.some((p) => p.severity === "error")).toBe(true);
    }
  });

  it("says plainly when there is no header row at all", () => {
    const outcome = preview("");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/no header row/);
  });
});
