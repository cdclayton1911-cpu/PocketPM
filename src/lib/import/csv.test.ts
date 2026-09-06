import { describe, expect, it } from "vitest";

import { decodeCsv, detectDelimiter, parseCsv, readCsv } from "./csv";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("RFC 4180 parsing", () => {
  it("parses a plain file", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside quotes", () => {
    expect(parseCsv('id,name\nA1,"Pour slab, level 2"')).toEqual([
      ["id", "name"],
      ["A1", "Pour slab, level 2"],
    ]);
  });

  it("keeps a newline inside quotes", () => {
    expect(parseCsv('id,notes\nA1,"line one\nline two"')).toEqual([
      ["id", "notes"],
      ["A1", "line one\nline two"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('id,name\nA1,"6"" conduit"')).toEqual([
      ["id", "name"],
      ["A1", '6" conduit'],
    ]);
  });

  it("handles CRLF the same as LF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not invent a row from a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
  });

  it("keeps a final row that has no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
  });

  it("preserves empty fields rather than collapsing them", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("keeps an empty quoted field", () => {
    expect(parseCsv('a,b\n"",x')).toEqual([
      ["a", "b"],
      ["", "x"],
    ]);
  });
});

describe("encoding detection", () => {
  it("strips a UTF-8 BOM instead of leaving it in the first header", () => {
    // Left in place, the BOM makes the first column header never match a
    // mapping hint, and the failure looks like "your file is wrong".
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("id,name\nA1,x")]);
    const decoded = decodeCsv(bytes);
    expect(decoded.encoding).toBe("utf-8-bom");
    expect(readCsv(bytes).headers[0]).toBe("id");
  });

  it("decodes UTF-16LE, which is what Excel writes for Unicode CSV", () => {
    const text = "id,name\nA1,Ø12 bar";
    const buf = new Uint8Array(2 + text.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      buf[2 + i * 2] = code & 0xff;
      buf[3 + i * 2] = code >> 8;
    }
    const decoded = decodeCsv(buf);
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.text).toContain("Ø12 bar");
  });

  it("falls back to CP-1252 rather than producing mojibake", () => {
    // 0xD8 is Ø in CP-1252 and invalid as a lone UTF-8 lead byte. Decoding it
    // as UTF-8 yields a replacement character — well-formed, silently wrong.
    const bytes = new Uint8Array([...utf8("id,name\nA1,"), 0xd8, ...utf8("12 bar")]);
    const decoded = decodeCsv(bytes);
    expect(decoded.encoding).toBe("windows-1252");
    expect(decoded.text).toContain("Ø12 bar");
    expect(decoded.text).not.toContain("�");
  });

  it("reads plain UTF-8 without a BOM and says the encoding was guessed", () => {
    const decoded = decodeCsv(utf8("id,name\nA1,Ø12"));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.guessed).toBe(true);
  });
});

describe("delimiter detection", () => {
  it("finds a semicolon, which Excel writes in comma-decimal locales", () => {
    expect(detectDelimiter("id;name;start")).toBe(";");
  });

  it("finds a tab", () => {
    expect(detectDelimiter("id\tname\tstart")).toBe("\t");
  });

  it("does not count a delimiter inside a quoted header", () => {
    expect(detectDelimiter('"Activity, description";start')).toBe(";");
  });

  it("defaults to comma", () => {
    expect(detectDelimiter("id")).toBe(",");
  });
});

describe("readCsv", () => {
  it("pads short rows so column access is positional", () => {
    const table = readCsv(utf8("a,b,c\n1,2"));
    expect(table.rows[0]).toEqual(["1", "2", ""]);
  });

  it("drops blank lines but keeps row numbers pointing at the file", () => {
    const table = readCsv(utf8("a,b\n1,2\n\n3,4\n"));
    expect(table.rows).toHaveLength(2);
    // Row 4 in the file, not row 3 in the array — an error message that names
    // the wrong line is worse than one that names none.
    expect(table.rowNumbers).toEqual([2, 4]);
  });
});
