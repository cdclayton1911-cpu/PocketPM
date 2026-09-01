import { z } from "zod";

import { SUBMITTAL_DISPOSITION, SUBMITTAL_TYPE } from "@/types";

/** `project` is injected by the route factory and must not come from the body. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const submittalSchema = z.object({
  submittal_number: z.string().trim().min(1, "Submittal # is required").max(40),
  description: z.string().trim().min(1, "Description is required").max(300),
  spec_section: z.string().trim().max(40).optional().default(""),
  type: z.enum(SUBMITTAL_TYPE).optional(),
  // Relation to subcontractors; "" means unassigned.
  subcontractor: z.string().trim().optional().default(""),
  submitted_date: isoDate.optional().default(""),
  ae_due_date: isoDate.optional().default(""),
  returned_date: isoDate.optional().default(""),
  disposition: z.enum(SUBMITTAL_DISPOSITION).optional(),
  revision: z.string().trim().max(20).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const submittalUpdateSchema = submittalSchema.partial();
export type SubmittalInput = z.infer<typeof submittalSchema>;
