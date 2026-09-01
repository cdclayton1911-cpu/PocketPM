import { z } from "zod";

import { DEFICIENCY_SEVERITY, DEFICIENCY_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const deficiencySchema = z.object({
  def_number: z.string().trim().max(40).optional().default(""),
  description: z.string().trim().min(1, "Description is required").max(500),
  location: z.string().trim().max(200).optional().default(""),
  trade: z.string().trim().max(120).optional().default(""),
  // Relations; "" means unlinked.
  dfow: z.string().trim().optional().default(""),
  subcontractor: z.string().trim().optional().default(""),
  severity: z.enum(DEFICIENCY_SEVERITY).optional(),
  status: z.enum(DEFICIENCY_STATUS).optional(),
  code_reference: z.string().trim().max(200).optional().default(""),
  logged_date: isoDate.optional().default(""),
  due_date: isoDate.optional().default(""),
  closed_date: isoDate.optional().default(""),
  corrective_action: z.string().trim().max(5000).optional().default(""),
  verified_by: z.string().trim().max(150).optional().default(""),
});

export const deficiencyUpdateSchema = deficiencySchema.partial();
export type DeficiencyInput = z.infer<typeof deficiencySchema>;
