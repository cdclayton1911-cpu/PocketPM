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
const projectRoleFields = z.object({
    user: z.string().trim().max(20).optional().default(""),
    role: z.enum(PROJECT_ROLE_ROLE),
    company: z.string().trim().max(200).optional().default(""),
    contact_name: z.string().trim().max(150).optional().default(""),
    contact_email: z.string().trim().email("Enter a valid email address").or(z.literal("")).optional().default(""),
    contact_phone: z.string().trim().max(40).optional().default(""),
    is_external: z.coerce.boolean().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const projectRoleSchema = projectRoleFields.refine(
  (v) => Boolean(v.user) || Boolean(v.contact_name),
  {
    message: "Pick a team member, or give a name for an outside party",
    path: ["contact_name"],
  },
);

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

/**
 * Validate one submission from the role dialog.
 *
 * Edits and creates need different schemas, and the difference is not
 * cosmetic: `.partial()` THROWS on a schema carrying a refinement
 * ("`.partial()` cannot be used on object schemas containing refinements"),
 * so `projectRoleSchema.partial()` crashed the submit handler before it could
 * reach the network. It looked like a failing write; nothing was ever sent.
 *
 * TypeScript cannot catch it — `.partial` exists on the type and throws at
 * runtime — so the guard is this function plus its tests.
 *
 * On an edit the "name somebody" invariant is checked against the record as it
 * WILL be, merging the submitted fields over the existing ones. Checking the
 * patch alone would reject an edit that only changes the phone number.
 */
export function parseProjectRoleSubmission(
  raw: Record<string, unknown>,
  existing?: { user?: string; contact_name?: string } | null,
) {
  if (!existing) return projectRoleSchema.safeParse(raw);

  const parsed = projectRoleUpdateSchema.safeParse(raw);
  if (!parsed.success) return parsed;

  const user = parsed.data.user ?? existing.user ?? "";
  const contactName = parsed.data.contact_name ?? existing.contact_name ?? "";
  if (!user && !contactName) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: "custom" as const,
          path: ["contact_name"],
          message: "Pick a team member, or give a name for an outside party",
        },
      ]),
    };
  }
  return parsed;
}
