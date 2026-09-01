import { z } from "zod";

import { DRAWING_DISCIPLINE, DRAWING_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

/**
 * Drawing register metadata.
 *
 * The `file` field is deliberately absent. PocketBase file uploads need
 * multipart/form-data, and the CRUD route factory speaks JSON — so this module
 * manages the register (sheet numbers, revisions, status) while PDF upload
 * waits for a multipart-aware upload route. Accepting a `file` string here
 * would let a client point a record at an arbitrary stored filename.
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
