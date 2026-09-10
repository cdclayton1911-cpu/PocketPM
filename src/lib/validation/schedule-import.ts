import { z } from "zod";

import { describeFields, duplicateColumns, TARGET_FIELDS } from "@/lib/import/mapping";

/**
 * Request bodies for schedule import.
 *
 * `strictObject` throughout. This is a new write path, and it should not join
 * the 25 routes in the queued strict-validation audit: a plain `z.object`
 * silently drops unknown keys, so a mis-typed mapping field would import a
 * schedule missing a column and return 200 (docs/STATUS.md).
 */
const columnMapping = z
  .strictObject(
    Object.fromEntries(TARGET_FIELDS.map((f) => [f, z.number().int().min(0).max(500).optional()])) as Record<
      (typeof TARGET_FIELDS)[number],
      z.ZodOptional<z.ZodNumber>
    >,
  )
  // A column supplies at most one field. Enforced here as well as in the
  // mapper and the UI, because the server must not trust how a mapping was
  // built: a client that sends one column for every field would otherwise
  // import one value fifteen times and report success.
  .superRefine((mapping, ctx) => {
    for (const { index, fields } of duplicateColumns(mapping)) {
      ctx.addIssue({
        code: "custom",
        message: `Column ${index + 1} is mapped to ${describeFields(fields)}. A column can supply one field only.`,
      });
    }
  });

export const dateOrder = z.enum(["day-first", "month-first"]);

export const importPreviewSchema = z.strictObject({
  mapping: columnMapping,
  order: dateOrder,
  sampleSize: z.number().int().min(1).max(100).optional(),
});

export const importCommitSchema = z.strictObject({
  mapping: columnMapping,
  order: dateOrder,
  /**
   * Set only after the user has seen the baseline-orphan count.
   *
   * The server re-runs the dry run and refuses to write if baselines would be
   * orphaned without this — so acknowledgement cannot be skipped by calling the
   * endpoint directly, which is the difference between a warning and a guard.
   */
  acknowledgeBaselineOrphans: z.boolean().optional(),
});

export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
