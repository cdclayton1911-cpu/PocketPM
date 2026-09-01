import { z } from "zod";

import { PUNCH_LIST_ITEM_PRIORITY, PUNCH_LIST_ITEM_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

export const punchListSchema = z.object({
  item_number: z.string().trim().max(40).optional().default(""),
  description: z.string().trim().min(1, "Description is required").max(500),
  location: z.string().trim().max(200).optional().default(""),
  trade: z.string().trim().max(120).optional().default(""),
  subcontractor: z.string().trim().optional().default(""),
  priority: z.enum(PUNCH_LIST_ITEM_PRIORITY).optional(),
  status: z.enum(PUNCH_LIST_ITEM_STATUS).optional(),
  due_date: isoDate.optional().default(""),
  closed_date: isoDate.optional().default(""),
  assigned_to: z.string().trim().optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const punchListUpdateSchema = punchListSchema.partial();
export type PunchListInput = z.infer<typeof punchListSchema>;
