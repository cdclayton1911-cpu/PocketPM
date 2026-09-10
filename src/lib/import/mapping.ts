/**
 * Rows in, schedule records out. Format-agnostic on purpose.
 *
 * The CSV parser is the only CSV-specific part of import: it produces
 * `headers` and `rows`, and everything from here is shared. Phase 6 (XER) has
 * to produce the same two things and then slots into this seam unchanged.
 */

import { parseBoolCell, parseDateCell, parseNumberCell, type DateOrder, type ParsedCell } from "./dates";

/** Fields an import can populate. `planned_*` are the mirrored source dates. */
export const TARGET_FIELDS = [
  "activity_id",
  "activity",
  "planned_start",
  "planned_finish",
  "duration_days",
  "actual_start",
  "actual_finish",
  "pct_complete",
  "status",
  "is_milestone",
  "notes",
  "sort_order",
  "predecessors",
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

export const DATE_FIELDS: TargetField[] = [
  "planned_start",
  "planned_finish",
  "actual_start",
  "actual_finish",
];
export const NUMBER_FIELDS: TargetField[] = ["duration_days", "pct_complete", "sort_order"];

/** header index → target field. A field may be mapped at most once. */
export type ColumnMapping = Partial<Record<TargetField, number>>;

/**
 * Best guess from header names, shown to the user and never applied silently.
 *
 * A guessed mapping applied without review is the same failure shape as a
 * guessed date order: plausible output, no signal that it was a guess.
 */
const HEADER_HINTS: Record<TargetField, RegExp> = {
  activity_id: /^(activity[\s_-]*(id|code)?|id|task[\s_-]*(id|code)|wbs[\s_-]*code)$/i,
  activity: /^(activity([\s_-]*name)?|description|task([\s_-]*name)?|name|title)$/i,
  planned_start: /^(planned[\s_-]*start|start([\s_-]*date)?|early[\s_-]*start|bl[\s_-]*start)$/i,
  planned_finish: /^(planned[\s_-]*finish|finish([\s_-]*date)?|end([\s_-]*date)?|early[\s_-]*finish)$/i,
  duration_days: /^(duration([\s_-]*days?)?|orig(inal)?[\s_-]*dur(ation)?|days)$/i,
  actual_start: /^(actual[\s_-]*start|act[\s_-]*start)$/i,
  actual_finish: /^(actual[\s_-]*finish|act[\s_-]*finish|actual[\s_-]*end)$/i,
  pct_complete: /^(%|pct|percent)[\s_-]*(complete|done)?$|^complete$/i,
  status: /^(status|state)$/i,
  is_milestone: /^(milestone|is[\s_-]*milestone)$/i,
  notes: /^(notes?|comments?|remarks?)$/i,
  sort_order: /^(sort([\s_-]*order)?|seq(uence)?|order|line)$/i,
  predecessors: /^(pred(ecessors?)?|depends[\s_-]*on|logic)$/i,
};

export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<number>();
  for (const field of TARGET_FIELDS) {
    const hint = HEADER_HINTS[field];
    const index = headers.findIndex((h, i) => !taken.has(i) && hint.test(h.trim()));
    if (index >= 0) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface ParsedPredecessor {
  activity_id: string;
  type: RelationshipType;
  lag_days: number;
  raw: string;
  problem?: string;
}

const TYPES: RelationshipType[] = ["FS", "SS", "FF", "SF"];

/**
 * Parse one predecessor token, e.g. `A100`, `A100FS`, `A100FS+2`, `A100SS-1`.
 *
 * The lag is taken from the end first, then the two-letter type, then whatever
 * remains is the activity id. Doing it in that order matters: an activity
 * genuinely called `100FS` would otherwise lose its suffix to the type parser.
 * Defaults are FS and zero lag, which is what an id on its own means in P6.
 */
export function parsePredecessorToken(token: string): ParsedPredecessor | null {
  const raw = token.trim();
  if (!raw) return null;

  let rest = raw;
  let lag = 0;

  const lagMatch = /([+-]\s*\d+(?:\.\d+)?)\s*(?:d|days?)?$/i.exec(rest);
  if (lagMatch) {
    lag = Math.trunc(Number(lagMatch[1].replace(/\s+/g, "")));
    rest = rest.slice(0, lagMatch.index).trim();
  }

  let type: RelationshipType = "FS";
  const upper = rest.toUpperCase();
  for (const t of TYPES) {
    if (upper.endsWith(t) && rest.length > t.length) {
      type = t;
      rest = rest.slice(0, -t.length).trim();
      break;
    }
  }

  // Trailing separators left by "A100 FS + 2" style spacing.
  rest = rest.replace(/[\s:_-]+$/, "");

  if (!rest) return { activity_id: raw, type, lag_days: lag, raw, problem: "no activity id" };
  return { activity_id: rest, type, lag_days: lag, raw };
}

export function parsePredecessorCell(cell: string): ParsedPredecessor[] {
  return (cell ?? "")
    .split(/[,;]/)
    .map((t) => parsePredecessorToken(t))
    .filter((p): p is ParsedPredecessor => p !== null);
}

export interface MappedActivity {
  rowNumber: number;
  activity_id: string;
  activity: string;
  planned_start: string;
  planned_finish: string;
  actual_start: string;
  actual_finish: string;
  duration_days: number | null;
  pct_complete: number | null;
  status: string;
  is_milestone: boolean;
  notes: string;
  sort_order: number | null;
  predecessors: ParsedPredecessor[];
  /** Raw-versus-parsed for every date and numeric cell, for the preview. */
  cells: Partial<Record<TargetField, ParsedCell<string | number | boolean>>>;
}

export interface RowProblem {
  rowNumber: number;
  field?: TargetField;
  message: string;
  severity: "error" | "warning";
}

export interface MappedResult {
  activities: MappedActivity[];
  problems: RowProblem[];
}

function cellAt(row: readonly string[], index: number | undefined): string {
  return index === undefined ? "" : (row[index] ?? "");
}

export function mapRows(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  rowNumbers: readonly number[],
  mapping: ColumnMapping,
  order: DateOrder,
): MappedResult {
  const activities: MappedActivity[] = [];
  const problems: RowProblem[] = [];

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i] ?? i + 2;
    const cells: MappedActivity["cells"] = {};

    const activityId = cellAt(row, mapping.activity_id).trim();
    if (!activityId) {
      // Fatal for the row, not the file: activity_id is what baselines join on
      // and what re-import replaces against.
      problems.push({
        rowNumber,
        field: "activity_id",
        severity: "error",
        message: "No activity ID. Baselines match activities by this value, so the row cannot be imported.",
      });
      return;
    }

    const dates: Record<string, string> = {};
    for (const field of DATE_FIELDS) {
      const raw = cellAt(row, mapping[field]);
      const parsed = parseDateCell(raw, order);
      cells[field] = parsed;
      if (raw.trim() && parsed.value === null) {
        problems.push({
          rowNumber,
          field,
          severity: "error",
          message: `"${raw}" is not a date this can read${parsed.problem ? ` — ${parsed.problem}` : ""}.`,
        });
      }
      dates[field] = parsed.value ?? "";
    }

    const numbers: Record<string, number | null> = {};
    for (const field of NUMBER_FIELDS) {
      const raw = cellAt(row, mapping[field]);
      const parsed = parseNumberCell(raw);
      cells[field] = parsed;
      if (raw.trim() && parsed.value === null) {
        problems.push({ rowNumber, field, severity: "error", message: `"${raw}" is not a number.` });
      }
      numbers[field] = parsed.value;
    }

    const milestoneRaw = cellAt(row, mapping.is_milestone);
    const milestone = parseBoolCell(milestoneRaw);
    cells.is_milestone = milestone;

    const pct = numbers.pct_complete;
    if (pct !== null && (pct < 0 || pct > 100)) {
      problems.push({
        rowNumber,
        field: "pct_complete",
        severity: "warning",
        message: `Percent complete is ${pct}; it will be stored as given.`,
      });
    }

    if (!dates.planned_start && !dates.planned_finish && numbers.duration_days === null) {
      problems.push({
        rowNumber,
        severity: "warning",
        message: "No start, finish, or duration — this activity cannot be scheduled.",
      });
    }

    if (dates.planned_start && dates.planned_finish && dates.planned_finish < dates.planned_start) {
      problems.push({
        rowNumber,
        severity: "error",
        message: `Finish ${dates.planned_finish} is before start ${dates.planned_start}.`,
      });
    }

    const predecessors = parsePredecessorCell(cellAt(row, mapping.predecessors));
    for (const p of predecessors) {
      if (p.problem) {
        problems.push({
          rowNumber,
          field: "predecessors",
          severity: "error",
          message: `Could not read predecessor "${p.raw}" — ${p.problem}.`,
        });
      }
    }

    activities.push({
      rowNumber,
      activity_id: activityId,
      activity: cellAt(row, mapping.activity).trim() || activityId,
      planned_start: dates.planned_start,
      planned_finish: dates.planned_finish,
      actual_start: dates.actual_start,
      actual_finish: dates.actual_finish,
      duration_days: numbers.duration_days,
      pct_complete: pct,
      status: cellAt(row, mapping.status).trim(),
      is_milestone: milestone.value === true,
      notes: cellAt(row, mapping.notes).trim(),
      sort_order: numbers.sort_order,
      predecessors,
      cells,
    });
  });

  return { activities, problems };
}

/** Header indices no target field claimed, so the UI can list them. */
export function unmappedColumns(headers: readonly string[], mapping: ColumnMapping): string[] {
  const used = new Set(Object.values(mapping));
  return headers.filter((_, i) => !used.has(i));
}

/**
 * Point `field` at column `index`, or clear it with `null`.
 *
 * Keeps the one-column-one-field invariant: if another field already holds the
 * column, the column MOVES and the other field is cleared. A mapping where many
 * fields read one column imports many copies of one value while looking
 * configured, so the rule lives here — tested once — rather than being trusted
 * in a component.
 */
export function assignColumn(
  mapping: ColumnMapping,
  field: TargetField,
  index: number | null,
): ColumnMapping {
  const next: ColumnMapping = {};
  for (const f of TARGET_FIELDS) {
    const current = mapping[f];
    if (current === undefined || f === field) continue;
    if (index !== null && current === index) continue;
    next[f] = current;
  }
  if (index !== null) next[field] = index;
  return next;
}

/** Columns claimed by more than one field. Empty when the mapping is sound. */
export function duplicateColumns(mapping: ColumnMapping): { index: number; fields: TargetField[] }[] {
  const byIndex = new Map<number, TargetField[]>();
  for (const f of TARGET_FIELDS) {
    const index = mapping[f];
    if (index === undefined) continue;
    const list = byIndex.get(index);
    if (list) list.push(f);
    else byIndex.set(index, [f]);
  }
  return [...byIndex.entries()]
    .filter(([, fields]) => fields.length > 1)
    .map(([index, fields]) => ({ index, fields }));
}

/** "a and b", or "a, b, c and 4 other fields" — for messages a person reads. */
export function describeFields(fields: readonly string[]): string {
  if (fields.length <= 2) return fields.join(" and ");
  if (fields.length === 3) return `${fields[0]}, ${fields[1]} and ${fields[2]}`;
  const rest = fields.length - 3;
  return `${fields.slice(0, 3).join(", ")} and ${rest} other field${rest === 1 ? "" : "s"}`;
}
