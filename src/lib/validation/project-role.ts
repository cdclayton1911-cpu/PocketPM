import { z } from "zod";

import { PROJECT_ROLE_ROLE } from "@/types";

/**
 * A party on the project.
 *
 * **This grants no access.** A row here says what someone is called and what
 * they are responsible for; `projects.members` is what lets them see anything.
 * Keeping them separate is what makes it safe to record an external architect
 * who must never read the project.
 */
export const projectRoleSchema = z
  .object({
    user: z.string().trim().max(20).optional().default(""),
    role: z.enum(PROJECT_ROLE_ROLE),
    company: z.string().trim().max(200).optional().default(""),
    contact_name: z.string().trim().max(150).optional().default(""),
    contact_email: z.string().trim().email("Enter a valid email address").or(z.literal("")).optional().default(""),
    contact_phone: z.string().trim().max(40).optional().default(""),
    is_external: z.coerce.boolean().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .refine((v) => Boolean(v.user) || Boolean(v.contact_name), {
    message: "Pick a team member, or give a name for an outside party",
    path: ["contact_name"],
  });

export const projectRoleUpdateSchema = z.object({
  user: z.string().trim().max(20).optional(),
  role: z.enum(PROJECT_ROLE_ROLE).optional(),
  company: z.string().trim().max(200).optional(),
  contact_name: z.string().trim().max(150).optional(),
  contact_email: z.string().trim().email("Enter a valid email address").or(z.literal("")).optional(),
  contact_phone: z.string().trim().max(40).optional(),
  is_external: z.coerce.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type ProjectRoleInput = z.infer<typeof projectRoleSchema>;
