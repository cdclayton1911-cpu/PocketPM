/**
 * RFC 4180 CSV parsing, plus the encoding detection that has to come first.
 *
 * Pure and dependency-free. A spreadsheet parser was deliberately not added:
 * XLSX brings merged cells, multiple sheets, dates as floats in three possible
 * epochs, and duration columns that are secretly text — every one a mapping
 * edge case and a support ticket, on a format where the user has a one-step
 * escape hatch ("Save As → CSV").
 *
 * ## Encoding is detected, never assumed
 *
 * Excel on Windows writes CP-1252 or UTF-16LE with a BOM. Decoding those as
 * UTF-8 turns the diameter sign in a rebar callout into mojibake — output that
 * is perfectly well-formed and silently wrong, which no downstream comparison
 * can catch. So the bytes are sniffed, and the detected encoding is reported
 * so a human can see it rather than infer it.
 */

export type DetectedEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

export interface DecodedFile {
  text: string;
  encoding: DetectedEncoding;
  /** True when the encoding was guessed rather than declared by a BOM. */
  guessed: boolean;
}

/**
 * Decode file bytes to text.
 *
 * A BOM is authoritative. Without one, UTF-8 is tried strictly: if the bytes
 * are not valid UTF-8 they are almost certainly CP-1252 out of Excel, which
 * never fails to decode and would otherwise produce replacement characters.
 */
export function decodeCsv(bytes: Uint8Array): DecodedFile {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "utf-8-bom",
      guessed: false,
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
      guessed: false,
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
      guessed: false,
    };
  }

  try {
    // `fatal` is the whole point: a silent replacement character is exactly the
    // failure this function exists to prevent.
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
      guessed: true,
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
      guessed: true,
    };
  }
}

export const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Guess the delimiter from the header line.
 *
 * Counted outside quotes only, so a header like `"Activity, description"` does
 * not vote for a comma. Semicolon matters in practice: Excel writes it in
 * locales where the comma is the decimal separator.
 */
export function detectDelimiter(text: string): Delimiter {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parse RFC 4180 CSV into rows of raw strings.
 *
 * Handles quoted fields, delimiters and newlines inside quotes, doubled quotes
 * as an escaped quote, CRLF and LF line endings, and a trailing newline.
 * Deliberately does no type coercion — every cell comes back as the exact text
 * it held, so the preview can show the raw cell beside whatever the mapper
 * decided it meant.
 */
export function parseCsv(text: string, delimiter: Delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      started = true;
      continue;
    }
    if (ch === delimiter) {
      started = true;
      endField();
      continue;
    }
    if (ch === "\r") {
      // CRLF and a bare CR both end the row; the LF is consumed with it.
      if (text[i + 1] === "\n") i += 1;
      endRow();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    started = true;
    field += ch;
  }

  // A trailing newline must not produce a phantom empty row, but a genuine
  // final row without one must survive.
  if (started || field !== "" || row.length > 0) endRow();

  return rows;
}

export interface ParsedTable {
  headers: string[];
  /** Data rows, aligned to `headers`. Short rows are padded with "". */
  rows: string[][];
  encoding: DetectedEncoding;
  encodingGuessed: boolean;
  delimiter: Delimiter;
  /** 1-based line numbers, for error messages that point at the file. */
  rowNumbers: number[];
}

/** Decode, detect, parse, and drop fully blank rows. */
export function readCsv(bytes: Uint8Array): ParsedTable {
  const { text, encoding, guessed } = decodeCsv(bytes);
  const delimiter = detectDelimiter(text);
  const all = parseCsv(text, delimiter);

  const headers = (all[0] ?? []).map((h) => h.trim());
  const rows: string[][] = [];
  const rowNumbers: number[] = [];

  for (let i = 1; i < all.length; i += 1) {
    const raw = all[i];
    // A blank line in the middle of a file is noise, not an activity.
    if (raw.every((cell) => cell.trim() === "")) continue;
    const padded = [...raw];
    while (padded.length < headers.length) padded.push("");
    rows.push(padded);
    rowNumbers.push(i + 1);
  }

  return { headers, rows, encoding, encodingGuessed: guessed, delimiter, rowNumbers };
}
