import { z } from "zod";

import { DRAWING_DISCIPLINE, DRAWING_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/**
 * Drawing register metadata.
 *
 * `file` is still absent from this schema, and deliberately so even though
 * uploads now work. The PDF arrives as a multipart part, not as a value: the
 * route factory pulls file parts out before Zod sees the body, and PocketBase
 * assigns the stored name. Accepting a `file` string here would let a client
 * point a record at an arbitrary already-stored filename.
 */
export const drawingSchema = z.object({
  sheet_number: z.string().trim().min(1, "Sheet number is required").max(40),
  title: z.string().trim().min(1, "Title is required").max(300),
  discipline: z.enum(DRAWING_DISCIPLINE).optional(),
  revision: z.string().trim().max(20).optional().default(""),
  rev_date: isoDate.optional().default(""),
  status: z.enum(DRAWING_STATUS).optional(),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const drawingUpdateSchema = drawingSchema.partial();
export type DrawingInput = z.infer<typeof drawingSchema>;
