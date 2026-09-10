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
  /** UTF-8 found inside a windows-1252 file — see decodeMixed. Empty otherwise. */
  embeddedUtf8: EmbeddedUtf8[];
}

/**
 * UTF-8 text found inside a file that is otherwise windows-1252.
 *
 * P6 writes windows-1252, but free-text fields — HTML notes especially — can
 * carry UTF-8 pasted from another program, byte-order mark included. Decoding
 * the whole file one way turns that BOM into "ï»¿": well-formed, silently
 * wrong. So each such span is decoded as UTF-8 and REPORTED, one entry per line.
 */
export interface EmbeddedUtf8 {
  /** 1-based physical line in the file. */
  line: number;
  /** The characters found, decoded as UTF-8; "U+FEFF" for a byte-order mark. */
  decoded: string;
  /** A byte-order mark, which is removed rather than shown. */
  byteOrderMark: boolean;
}

/** windows-1252, one entry per byte, built once. */
const CP1252: string[] = (() => {
  const decoder = new TextDecoder("windows-1252");
  return Array.from({ length: 256 }, (_, b) => decoder.decode(Uint8Array.of(b)));
})();

/** A complete, well-formed UTF-8 sequence starting at `i`, or null. */
function utf8SequenceAt(bytes: Uint8Array, i: number): { length: number; codePoint: number } | null {
  const b0 = bytes[i];
  let length: number;
  let min: number;
  if (b0 >= 0xc2 && b0 <= 0xdf) [length, min] = [2, 0x80];
  else if (b0 >= 0xe0 && b0 <= 0xef) [length, min] = [3, 0x800];
  else if (b0 >= 0xf0 && b0 <= 0xf4) [length, min] = [4, 0x10000];
  else return null;
  if (i + length > bytes.length) return null;
  let codePoint = b0 & (length === 2 ? 0x1f : length === 3 ? 0x0f : 0x07);
  for (let k = 1; k < length; k += 1) {
    const c = bytes[i + k];
    if ((c & 0xc0) !== 0x80) return null;
    codePoint = (codePoint << 6) | (c & 0x3f);
  }
  // Overlong forms and surrogates are not UTF-8; treating them as such would
  // "repair" bytes that were always meant as windows-1252.
  if (codePoint < min || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
  return { length, codePoint };
}

/**
 * Decode windows-1252, except where the bytes form well-formed UTF-8.
 *
 * A lone high byte — £ is 0xA3, ¥ 0xA5, € 0x80 — is never a valid UTF-8
 * sequence on its own, so currency symbols decode as windows-1252 exactly as
 * before. Only a lead byte followed by the right continuation bytes is read as
 * UTF-8.
 *
 * The one ambiguity: a genuine windows-1252 "Â£" is also valid UTF-8 for "£".
 * Those two characters together are the classic sign of text that was already
 * double-encoded, so repairing it is almost always right — and every repair is
 * reported, so it is visible rather than assumed.
 */
function decodeMixed(bytes: Uint8Array): { text: string; embedded: EmbeddedUtf8[] } {
  let text = "";
  const byLine = new Map<number, EmbeddedUtf8>();
  let line = 1;
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b >= 0x80) {
      const seq = utf8SequenceAt(bytes, i);
      if (seq) {
        const bom = seq.codePoint === 0xfeff;
        const entry = byLine.get(line) ?? { line, decoded: "", byteOrderMark: false };
        entry.decoded += bom ? (entry.decoded ? " U+FEFF" : "U+FEFF") : String.fromCodePoint(seq.codePoint);
        entry.byteOrderMark ||= bom;
        byLine.set(line, entry);
        if (!bom) text += String.fromCodePoint(seq.codePoint);
        i += seq.length;
        continue;
      }
    }
    if (b === 0x0a) line += 1;
    text += CP1252[b];
    i += 1;
  }
  return { text, embedded: [...byLine.values()].sort((a, b) => a.line - b.line) };
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
      embeddedUtf8: [],
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
      guessed: false,
      embeddedUtf8: [],
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
      guessed: false,
      embeddedUtf8: [],
    };
  }

  try {
    // `fatal` is the whole point: a silent replacement character is exactly the
    // failure this function exists to prevent.
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
      guessed: true,
      embeddedUtf8: [],
    };
  } catch {
    const { text, embedded } = decodeMixed(bytes);
    return { text, encoding: "windows-1252", guessed: true, embeddedUtf8: embedded };
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
  /** UTF-8 found inside a windows-1252 file, by line. */
  embeddedUtf8: EmbeddedUtf8[];
}

/** Decode, detect, parse, and drop fully blank rows. */
export function readCsv(bytes: Uint8Array): ParsedTable {
  const { text, encoding, guessed, embeddedUtf8 } = decodeCsv(bytes);
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

  return { headers, rows, encoding, encodingGuessed: guessed, delimiter, rowNumbers, embeddedUtf8 };
}
