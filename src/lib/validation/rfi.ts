import { z } from "zod";

import { RFI_COST_IMPACT, RFI_PRIORITY, RFI_SCHED_IMPACT, RFI_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/** "" from an empty number input must not become 0. */
const optionalNumber = (min: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const rfiSchema = z.object({
  rfi_number: z.string().trim().min(1, "RFI # is required").max(40),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  question: z.string().trim().min(1, "Question is required").max(5000),
  drawing: z.string().trim().max(120).optional().default(""),
  spec_section: z.string().trim().max(40).optional().default(""),
  ball_in_court: z.string().trim().max(120).optional().default(""),
  // Schema caps response_days at 1..60.
  response_days: optionalNumber(1, 60),
  submitted_date: isoDate.optional().default(""),
  due_date: isoDate.optional().default(""),
  answer: z.string().trim().max(5000).optional().default(""),
  answer_date: isoDate.optional().default(""),
  status: z.enum(RFI_STATUS).optional(),
  cost_impact: z.enum(RFI_COST_IMPACT).optional(),
  cost_amount: optionalNumber(0),
  sched_impact: z.enum(RFI_SCHED_IMPACT).optional(),
  sched_days: optionalNumber(0),
  priority: z.enum(RFI_PRIORITY).optional(),
  reference: z.string().trim().max(120).optional().default(""),
});

export const rfiUpdateSchema = rfiSchema.partial();
export type RfiInput = z.infer<typeof rfiSchema>;
