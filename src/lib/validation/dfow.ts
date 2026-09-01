import { z } from "zod";

import { DFOW_PHASE } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

const optionalNumber = (min: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const dfowSchema = z.object({
  dfow_number: z.string().trim().min(1, "DFOW # is required").max(40),
  name: z.string().trim().min(1, "Feature of work is required").max(300),
  spec_sections: z.string().trim().max(200).optional().default(""),
  subcontractor: z.string().trim().optional().default(""),
  phase: z.enum(DFOW_PHASE).optional(),
  score: optionalNumber(0, 100),
  planned_start: isoDate.optional().default(""),
  // The three CQM-C phase sign-off dates.
  prep_date: isoDate.optional().default(""),
  init_date: isoDate.optional().default(""),
  complete_date: isoDate.optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const dfowUpdateSchema = dfowSchema.partial();
export type DfowInput = z.infer<typeof dfowSchema>;
