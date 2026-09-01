import { z } from "zod";

import { SAFETY_OBSERVATION_SEVERITY, SAFETY_OBSERVATION_STATUS, SAFETY_OBSERVATION_TYPE } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const safetyObservationSchema = z.object({
  obs_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Observation date is required"),
  description: z.string().trim().min(1, "Description is required").max(500),
  location: z.string().trim().max(200).optional().default(""),
  trade: z.string().trim().max(120).optional().default(""),
  subcontractor: z.string().trim().optional().default(""),
  type: z.enum(SAFETY_OBSERVATION_TYPE).optional(),
  severity: z.enum(SAFETY_OBSERVATION_SEVERITY).optional(),
  osha_reference: z.string().trim().max(200).optional().default(""),
  corrective_action: z.string().trim().max(5000).optional().default(""),
  status: z.enum(SAFETY_OBSERVATION_STATUS).optional(),
});

export const safetyObservationUpdateSchema = safetyObservationSchema.partial();
export type SafetyObservationInput = z.infer<typeof safetyObservationSchema>;

export { isoDate };
