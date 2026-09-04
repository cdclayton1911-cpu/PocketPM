import { z } from "zod";

import { PROJECT_DOCUMENT_CATEGORY } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/**
 * A project-level document: contract, spec, geotech report, permit.
 *
 * `file` is absent for the usual reason — it arrives as a multipart part, and
 * accepting a filename string would let a client point a record at an arbitrary
 * already-stored file.
 *
 * `superseded_by` is accepted because pointing an old spec at its replacement
 * is an ordinary edit, and PocketBase's project rule already prevents naming a
 * document in another project.
 */
export const projectDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  category: z.enum(PROJECT_DOCUMENT_CATEGORY).optional(),
  doc_number: z.string().trim().max(60).optional().default(""),
  revision: z.string().trim().max(60).optional().default(""),
  issued_date: isoDate.optional().default(""),
  received_date: isoDate.optional().default(""),
  issued_by: z.string().trim().max(150).optional().default(""),
  is_current: z.coerce.boolean().optional(),
  superseded_by: z.string().trim().max(20).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
});

export const projectDocumentUpdateSchema = projectDocumentSchema.partial();
export type ProjectDocumentInput = z.infer<typeof projectDocumentSchema>;
