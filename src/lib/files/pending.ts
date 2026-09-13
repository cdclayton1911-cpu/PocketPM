/**
 * What saving a file field will do, in words, BEFORE it is saved.
 *
 * The daily-log loss happened because an upload replaced every file on the
 * record and reported success. Uploads now add (see crud-route.ts), but a
 * single-file field still replaces, and a removal is still a removal. Both are
 * stated here, in the dialog, so nothing leaves a record without the person
 * saving having been told first.
 */

/**
 * The most one save may carry. Cloudflare refuses request bodies over 100 MB
 * with a 413 that never reaches the app, so the site would show a generic
 * failure. Refusing at 95 MB, with a sentence, leaves room for the rest of the
 * form.
 */
export const MAX_SAVE_BYTES = 95 * 1024 * 1024;

function list(names: readonly string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export function describePending(input: {
  /** Files already stored on the record. */
  existing: readonly string[];
  /** Existing files marked for removal. */
  removed: readonly string[];
  /** Names of newly picked files. */
  picked: readonly string[];
  maxSelect: number;
}): string | null {
  const { existing, removed, picked, maxSelect } = input;
  const kept = existing.filter((name) => !removed.includes(name));

  if (maxSelect <= 1) {
    const current = kept[0] ?? removed[0];
    if (picked.length > 0 && current) return `On save, ${current} will be replaced by ${picked[0]}.`;
    if (picked.length > 0) return "1 file ready to upload.";
    if (removed.length > 0) return `On save, ${removed[0]} will be removed.`;
    return null;
  }

  const parts: string[] = [];
  if (picked.length > 0) {
    parts.push(
      `${picked.length} file${picked.length === 1 ? "" : "s"} ready to upload, added to ` +
        (kept.length > 0 ? `the ${kept.length} already attached, which stay.` : "this record."),
    );
  }
  if (removed.length > 0) parts.push(`On save, ${list(removed)} will be removed.`);
  return parts.length > 0 ? parts.join(" ") : null;
}
