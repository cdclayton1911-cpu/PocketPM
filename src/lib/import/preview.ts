/**
 * The import preview, as one pure function.
 *
 * Both the dry run (POST) and the commit (PUT) go through this, so the rules a
 * file is judged by cannot differ between what the user was shown and what is
 * written. Kept free of the request and the database so it can be tested
 * against a file directly — which is how a refusal that names nothing gets
 * caught before a user finds it.
 */

import { importPreviewSchema } from "@/lib/validation/schedule-import";

import { readCsv, type EmbeddedUtf8 } from "./csv";
import type { DateOrder } from "./dates";
import { buildDryRun, type DryRunReport, type ExistingBaseline } from "./dryrun";
import {
  describeFields,
  duplicateColumns,
  guessMapping,
  mapRows,
  unmappedColumns,
  type ColumnMapping,
  type MappedActivity,
  type RowProblem,
} from "./mapping";
import { detectUnsupportedShape } from "./shape";

export type PreviewOutcome =
  | {
      ok: true;
      report: DryRunReport;
      mapping: ColumnMapping;
      order: DateOrder;
      /** Every mapped activity, not just the sample — the commit writes these. */
      activities: MappedActivity[];
    }
  | { ok: false; message: string };

export function previewImport(input: {
  bytes: Uint8Array;
  /** The mapping JSON as posted, or null to guess from the headers. */
  rawMapping: string | null;
  rawOrder: string | null;
  baselines: ExistingBaseline[];
}): PreviewOutcome {
  const table = readCsv(input.bytes);
  if (table.headers.length === 0 || table.headers.every((h) => h.trim() === "")) {
    return { ok: false, message: "That file has no header row." };
  }

  const common = {
    encoding: table.encoding,
    encodingGuessed: table.encodingGuessed,
    delimiter: table.delimiter,
    headers: table.headers,
    baselines: input.baselines,
  };

  // Judge the file's shape before mapping it. Mapped, a flattened P6 export
  // yields one true-but-useless error per line and never the actual reason.
  const shape = detectUnsupportedShape(table.headers, table.rows);
  if (shape) {
    return {
      ok: true,
      mapping: {},
      order: "month-first",
      activities: [],
      report: buildDryRun({
        ...common,
        unmapped: [],
        activities: [],
        problems: [],
        skipped: table.rows.length,
        fileProblems: [{ rowNumber: 0, severity: "error", message: shape }],
      }),
    };
  }

  let mappingInput: unknown = guessMapping(table.headers);
  if (input.rawMapping) {
    try {
      mappingInput = JSON.parse(input.rawMapping);
    } catch {
      return { ok: false, message: "The column mapping could not be read. Choose the columns again." };
    }
    // Named rather than numbered: say which HEADER the fields are all reading.
    // The schema refuses this too, but can only say "column 3".
    if (mappingInput && typeof mappingInput === "object" && !Array.isArray(mappingInput)) {
      const [dupe] = duplicateColumns(mappingInput as ColumnMapping);
      if (dupe) {
        const header = table.headers[dupe.index] || `column ${dupe.index + 1}`;
        return {
          ok: false,
          message:
            `"${header}" is mapped to ${describeFields(dupe.fields)}. A column can supply one field only — ` +
            "choose a different column for all but one of them.",
        };
      }
    }
  }

  const parsed = importPreviewSchema.safeParse({
    mapping: mappingInput,
    order: input.rawOrder ?? "month-first",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "The column mapping is not valid." };
  }

  const { mapping, order } = parsed.data;
  const { activities, problems } = mapRows(table.headers, table.rows, table.rowNumbers, mapping, order);
  const report = buildDryRun({
    ...common,
    unmapped: unmappedColumns(table.headers, mapping),
    activities,
    problems,
    skipped: table.rows.length - activities.length,
    activityIdMapped: mapping.activity_id !== undefined,
    fileProblems: encodingNotes(table.embeddedUtf8),
  });

  return { ok: true, report, mapping, order, activities };
}

/**
 * One warning per line of UTF-8 found inside a windows-1252 file.
 *
 * Warnings, not errors: the text was decoded correctly. But it was decoded by
 * a rule rather than read as declared, so it is shown for someone to check.
 */
function encodingNotes(found: EmbeddedUtf8[]): RowProblem[] {
  return found.map((e) => ({
    rowNumber: 0,
    severity: "warning" as const,
    message: e.byteOrderMark
      ? `Line ${e.line} has a UTF-8 byte-order mark inside a windows-1252 file — usually text pasted from ` +
        `another program. It was removed rather than shown as "\u00ef\u00bb\u00bf".`
      : `Line ${e.line} has UTF-8 text ("${e.decoded}") inside a windows-1252 file. It was decoded as UTF-8 ` +
        "rather than shown garbled — check it reads correctly.",
  }));
}
