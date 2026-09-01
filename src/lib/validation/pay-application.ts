import { z } from "zod";

import { PAY_APPLICATION_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

const optionalNumber = (min: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const payApplicationSchema = z.object({
  // Required by the schema, and the identifier a G702 is filed under.
  app_number: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(1, "Application # is required"),
  ),
  period_start: isoDate.optional().default(""),
  period_end: isoDate.optional().default(""),
  scheduled_value: optionalNumber(0),
  prev_billed: optionalNumber(0),
  this_period: optionalNumber(0),
  stored_materials: optionalNumber(0),
  total_to_date: optionalNumber(0),
  retainage_pct: optionalNumber(0, 100),
  retainage_amount: optionalNumber(0),
  net_this_period: optionalNumber(0),
  status: z.enum(PAY_APPLICATION_STATUS).optional(),
  submitted_date: isoDate.optional().default(""),
  certified_date: isoDate.optional().default(""),
  paid_date: isoDate.optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  // G703 continuation sheet, stored as a JSON string by the schema. Validated
  // as parseable rather than by shape: the line-item structure belongs to the
  // G703 editor, which is not built yet.
  sov_json: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => {
        if (!v) return true;
        try {
          JSON.parse(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Must be valid JSON" },
    ),
});

export const payApplicationUpdateSchema = payApplicationSchema.partial();
export type PayApplicationInput = z.infer<typeof payApplicationSchema>;
