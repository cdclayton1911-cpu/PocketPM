import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/** "" from an empty number input must not become 0. */
const optionalNumber = (min?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number()
      .pipe(min === undefined ? z.number() : z.number().min(min))
      .optional(),
  );

/**
 * The collection sets no max length on any text field, so the caps below are
 * the app's own. They exist to bound what one record can cost to store and to
 * send to the AI narrative task later, not because PocketBase asks for them.
 *
 * Temperatures are unbounded in the schema and deliberately kept wide here:
 * commercial work happens from Arizona summers to northern winters, and a
 * range that rejects a real reading is worse than one that accepts a typo.
 */
export const dailyLogSchema = z.object({
  // `error` covers the missing case: a .min(1) message never fires on
  // undefined, so an omitted field would report "expected string, received
  // undefined" to the user.
  log_date: z
    .string({ error: "Log date is required" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  weather: z.string().trim().max(120).optional().default(""),
  temp_high: optionalNumber(),
  temp_low: optionalNumber(),
  total_workers: optionalNumber(0),
  work_performed: z.string().trim().max(8000).optional().default(""),
  visitors: z.string().trim().max(2000).optional().default(""),
  deliveries: z.string().trim().max(2000).optional().default(""),
  equipment: z.string().trim().max(2000).optional().default(""),
  issues: z.string().trim().max(4000).optional().default(""),
  safety_notes: z.string().trim().max(4000).optional().default(""),
  /**
   * Accepted but not exposed by the form.
   *
   * Nothing writes it yet: the module ships CRUD-only while the AI modules wait
   * on credits. It is in the schema so the `daily-log` task in lib/ai/tasks.ts
   * can PATCH a generated narrative here without the validation changing — and
   * so a value that does exist survives an edit rather than being silently
   * blanked.
   */
  ai_generated: z.string().max(20000).optional(),
  signed_by: z.string().trim().max(150).optional().default(""),
  signed_date: isoDate.optional().default(""),
});

export const dailyLogUpdateSchema = dailyLogSchema.partial();
export type DailyLogInput = z.infer<typeof dailyLogSchema>;
