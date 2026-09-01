import { z } from "zod";

import { CHANGE_ORDER_REASON, CHANGE_ORDER_STATUS, CHANGE_ORDER_TYPE } from "@/types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""));

const optionalNumber = (min?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    min === undefined
      ? z.coerce.number().optional()
      : z.coerce.number().min(min).optional(),
  );

export const changeOrderSchema = z.object({
  co_number: z.string().trim().min(1, "CO # is required").max(40),
  description: z.string().trim().min(1, "Description is required").max(300),
  type: z.enum(CHANGE_ORDER_TYPE).optional(),
  initiated_by: z.string().trim().max(150).optional().default(""),
  reason: z.enum(CHANGE_ORDER_REASON).optional(),
  scope: z.string().trim().max(5000).optional().default(""),
  // Signed: a deductive change order is negative, so no minimum here.
  amount: optionalNumber(),
  days_impact: optionalNumber(0),
  submitted_date: isoDate.optional().default(""),
  approved_date: isoDate.optional().default(""),
  status: z.enum(CHANGE_ORDER_STATUS).optional(),
  rfi_reference: z.string().trim().optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export const changeOrderUpdateSchema = changeOrderSchema.partial();
export type ChangeOrderInput = z.infer<typeof changeOrderSchema>;
