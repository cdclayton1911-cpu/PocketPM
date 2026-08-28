import { z } from "zod";

import { PROJECT_CONTRACT_TYPE, PROJECT_STATUS } from "@/types";

/**
 * Create/edit payload for `projects`.
 *
 * `owner` is deliberately absent: it is a required relation, and the route
 * handler sets it from the session. Accepting it from the body would let a
 * client create a project owned by someone else.
 *
 * Every date in the schema is a `text` field, so these are strings. The regex
 * enforces the ISO shape PocketBase will not.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200),
  owner_name: z.string().trim().max(200).optional().default(""),
  architect_name: z.string().trim().max(200).optional().default(""),
  contract_type: z.enum(PROJECT_CONTRACT_TYPE).optional(),
  // Comes off a number input as a string; coerce and reject negatives.
  contract_value: z.coerce.number().min(0, "Cannot be negative").optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  city: z.string().trim().max(100).optional().default(""),
  // Two-letter state code, upper-cased for consistency.
  state: z
    .string()
    .trim()
    .max(2)
    .transform((v) => v.toUpperCase())
    .optional()
    .default(""),
  start_date: isoDate.optional().default(""),
  end_date: isoDate.optional().default(""),
  project_type: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/** Switching projects only needs an id; membership is checked server-side. */
export const setActiveProjectSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});
