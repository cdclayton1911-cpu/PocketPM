/**
 * Date and number parsing for imported cells.
 *
 * ## Why this cannot be automatic
 *
 * Excel's CSV export writes the user's LOCALE date format, and the file does
 * not record which one. `03/04/2026` is 3 April or 4 March and nothing in the
 * bytes distinguishes them. Guessing from the data is worse than useless: a
 * schedule whose days happen to all be ≤ 12 gives no evidence at all, and one
 * wrong guess shifts an entire schedule by up to eleven months while looking
 * completely ordinary.
 *
 * So the interpretation is an explicit user choice, and the preview shows the
 * parsed date beside the raw cell for every date column. The comparison is
 * made visible rather than assumed.
 */

export type DateOrder = "day-first" | "month-first";

export interface ParsedCell<T> {
  /** Exactly what was in the file. */
  raw: string;
  value: T | null;
  /** Why it could not be read, when value is null. */
  problem?: string;
  /** True when the raw text could legitimately be read the other way round. */
  ambiguous?: boolean;
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
/** e.g. 04-Mar-2026, 4 March 2026 */
const NAMED = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2}|\d{4})$/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Reject 31 February rather than letting Date roll it into March. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function fullYear(y: number): number {
  // Two-digit years: 70-99 are 1900s, everything else 2000s. A schedule dated
  // 1970 is far more likely to be a typo than real, but inventing a different
  // rule per file would be worse.
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/**
 * Parse one date cell into YYYY-MM-DD, honouring the chosen order.
 *
 * ISO input ignores `order` — it is unambiguous by construction, and applying a
 * day-first reading to `2026-03-04` would corrupt a file that was already
 * correct.
 */
export function parseDateCell(raw: string, order: DateOrder): ParsedCell<string> {
  const text = (raw ?? "").trim();
  if (!text) return { raw, value: null };

  const iso = ISO.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!isRealDate(year, month, day)) return { raw, value: null, problem: "not a real date" };
    return { raw, value: `${year}-${pad(month)}-${pad(day)}` };
  }

  const named = NAMED.exec(text);
  if (named) {
    const [, d, monthName, y] = named;
    const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
    if (!month) return { raw, value: null, problem: `unknown month "${monthName}"` };
    const year = fullYear(Number(y));
    const day = Number(d);
    if (!isRealDate(year, month, day)) return { raw, value: null, problem: "not a real date" };
    // A named month cannot be misread, whatever the order setting says.
    return { raw, value: `${year}-${pad(month)}-${pad(day)}` };
  }

  const slashed = SLASHED.exec(text);
  if (slashed) {
    const [, a, b, y] = slashed;
    const first = Number(a);
    const second = Number(b);
    const year = fullYear(Number(y));
    const day = order === "day-first" ? first : second;
    const month = order === "day-first" ? second : first;
    if (!isRealDate(year, month, day)) {
      // If the OTHER order would have worked, say so. That is the actionable
      // message — the file is fine and the toggle is set wrong — and it is a
      // comparison rather than a guess about what the user meant.
      const flipped = isRealDate(year, day, month);
      return {
        raw,
        value: null,
        problem: flipped
          ? "not a real date in the selected day/month order — it reads correctly in the other order"
          : "not a real date",
      };
    }
    return {
      raw,
      value: `${year}-${pad(month)}-${pad(day)}`,
      // Both readings are valid only when neither part exceeds 12.
      ambiguous: first <= 12 && second <= 12 && first !== second,
    };
  }

  return { raw, value: null, problem: "unrecognised date format" };
}

/** Parse a numeric cell, tolerating thousands separators and stray spaces. */
export function parseNumberCell(raw: string): ParsedCell<number> {
  const text = (raw ?? "").trim();
  if (!text) return { raw, value: null };
  const cleaned = text.replace(/[\s,]/g, "").replace(/%$/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { raw, value: null, problem: "not a number" };
  return { raw, value: n };
}

/** Truthy spellings a spreadsheet actually contains. */
export function parseBoolCell(raw: string): ParsedCell<boolean> {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return { raw, value: null };
  if (["y", "yes", "true", "1", "x"].includes(text)) return { raw, value: true };
  if (["n", "no", "false", "0"].includes(text)) return { raw, value: false };
  return { raw, value: null, problem: "not a yes/no value" };
}
