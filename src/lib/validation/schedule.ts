import { z } from "zod";

import { SCHEDULE_ITEM_STATUS } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

const optionalNumber = (min: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const scheduleItemSchema = z.object({
  activity: z.string().trim().min(1, "Activity is required").max(300),
  activity_id: z.string().trim().max(40).optional().default(""),
  planned_start: isoDate.optional().default(""),
  planned_finish: isoDate.optional().default(""),
  actual_start: isoDate.optional().default(""),
  actual_finish: isoDate.optional().default(""),
  forecast_finish: isoDate.optional().default(""),
  duration_days: optionalNumber(0),
  pct_complete: optionalNumber(0, 100),
  status: z.enum(SCHEDULE_ITEM_STATUS).optional(),
  // Checkbox: absent when unchecked, "on" when checked.
  is_milestone: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()).optional(),
  notes: z.string().trim().max(5000).optional().default(""),
  sort_order: optionalNumber(0),
});

export const scheduleItemUpdateSchema = scheduleItemSchema.partial();
export type ScheduleItemInput = z.infer<typeof scheduleItemSchema>;
