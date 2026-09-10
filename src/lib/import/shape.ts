/**
 * Recognise a file that is not a single activity table, BEFORE mapping it.
 *
 * A Primavera P6 XER is many tables in one file — currencies, calendars, WBS,
 * activities, relationships, resources — each introduced by `%T` (table),
 * `%F` (fields) and `%R` (row) markers under one `ERMHDR` line. Renamed to
 * .csv, or opened in a spreadsheet and saved as CSV, it still reads as CSV,
 * and the import then treats the ERMHDR line as the header row.
 *
 * Mapped as if it were a schedule, that produces zero activities and one
 * "No activity ID" error per line — thousands of them, every one true and none
 * of them the reason. The reason is the shape of the file, so the shape is
 * what gets named.
 */

const MARKER = /^%[TFRE]$/;

export function detectUnsupportedShape(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string | null {
  const first = (headers[0] ?? "").trim().toUpperCase();
  let markers = 0;
  const tables: string[] = [];
  for (const row of rows) {
    const cell = (row[0] ?? "").trim();
    if (!MARKER.test(cell)) continue;
    markers += 1;
    const name = (row[1] ?? "").trim();
    if (cell === "%T" && name) tables.push(name);
  }

  // ERMHDR is P6's own first line. The marker count catches an export whose
  // header line was stripped but whose tables were not.
  if (first !== "ERMHDR" && !(markers >= 3 && tables.length > 0)) return null;

  const listed = tables.length
    ? ` It holds ${tables.length} table${tables.length === 1 ? "" : "s"} one after another ` +
      `(${tables.slice(0, 6).join(", ")}${tables.length > 6 ? ", …" : ""}), so no single header ` +
      "row describes the activities."
    : " It holds several tables one after another, so no single header row describes the activities.";

  return (
    "This is a Primavera P6 XER export, not a single table of activities." +
    listed +
    " XER import is not supported yet. In P6, export the activity list as a spreadsheet — one row " +
    "per activity under one header row — and save that as CSV."
  );
}
