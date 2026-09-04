import { z } from "zod";

import { DOCUMENT_REVISION_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/**
 * A document revision.
 *
 * `submittal` and `rfi` are accepted from the body — unusually for this app,
 * where relations are normally injected server-side. They are safe here because
 * PocketBase's own rule requires the named parent to belong to the same project
 * as the revision (`submittal.project = project`), and `project` itself is
 * still injected from the cookie. A caller naming another tenant's parent is
 * refused by the database, not by this schema. See docs/revisions.md.
 *
 * `file` is absent for the usual reason: it arrives as a multipart part, and
 * accepting a filename string would let a client point a revision at an
 * arbitrary stored file.
 */
export const revisionSchema = z
  .object({
    submittal: z.string().trim().max(20).optional().default(""),
    rfi: z.string().trim().max(20).optional().default(""),
    revision_number: z.coerce.number().int().min(0).max(999),
    status: z.enum(DOCUMENT_REVISION_STATUS).optional(),
    is_current: z.coerce.boolean().optional(),
    issued_at: isoDate.optional().default(""),
    issued_by: z.string().trim().max(150).optional().default(""),
    stamped_by: z.string().trim().max(150).optional().default(""),
    stamped_at: isoDate.optional().default(""),
    review_due_at: isoDate.optional().default(""),
    notes: z.string().trim().max(4000).optional().default(""),
  })
  .refine((v) => Boolean(v.submittal) !== Boolean(v.rfi), {
    message: "A revision belongs to exactly one submittal or RFI",
    path: ["submittal"],
  });

/**
 * Updates never move a revision between parents, so the parent fields are not
 * partial-able — they are simply absent. That also keeps the update body clear
 * of the two fields whose agreement with `project` the rule checks.
 *
 * `.strict()` matters here more than anywhere else in the app. Zod's default is
 * to strip unknown keys, which meant a PATCH of `revision_number` on an issued
 * revision returned 200 with the field silently dropped: the data was safe, but
 * the caller was told the write succeeded when nothing happened. On a record
 * whose whole purpose is to be evidence, "OK" must not mean "ignored". The
 * frozen fields are refused loudly instead.
 */
export const revisionUpdateSchema = z.strictObject({
  status: z.enum(DOCUMENT_REVISION_STATUS).optional(),
  is_current: z.coerce.boolean().optional(),
  issued_at: isoDate.optional(),
  issued_by: z.string().trim().max(150).optional(),
  stamped_by: z.string().trim().max(150).optional(),
  stamped_at: isoDate.optional(),
  review_due_at: isoDate.optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type RevisionInput = z.infer<typeof revisionSchema>;
