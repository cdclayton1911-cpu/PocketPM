import { z } from "zod";

import { SUBCONTRACTOR_A401_STATUS, SUBCONTRACTOR_STATUS } from "@/types";

/**
 * Create/update payload for `subcontractors`.
 *
 * `project` is deliberately absent — the route factory injects it from the
 * active-project cookie, so a client cannot file a subcontractor under someone
 * else's project.
 *
 * Dates are `text` in the schema, so these are strings; the regex enforces the
 * ISO shape PocketBase will not.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/** "" from an untouched number input must not become 0. */
const optionalNumber = (max?: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0, "Cannot be negative").pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const subcontractorSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  trade: z.string().trim().min(1, "Trade is required").max(120),
  status: z.enum(SUBCONTRACTOR_STATUS).optional(),
  license_number: z.string().trim().max(80).optional().default(""),
  license_expiry: isoDate.optional().default(""),
  insurance_expiry: isoDate.optional().default(""),
  bond_capacity: optionalNumber(),
  // Experience Modification Rate: schema caps it at 5.
  emr: optionalNumber(5),
  quality_score: optionalNumber(100),
  a401_status: z.enum(SUBCONTRACTOR_A401_STATUS).optional(),
  contact_name: z.string().trim().max(150).optional().default(""),
  contact_email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional().default(""),
  contact_phone: z.string().trim().max(40).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  state: z
    .string()
    .trim()
    .max(2)
    .transform((v) => v.toUpperCase())
    .optional()
    .default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const subcontractorUpdateSchema = subcontractorSchema.partial();

export type SubcontractorInput = z.infer<typeof subcontractorSchema>;
