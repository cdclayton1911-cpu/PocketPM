import { z } from "zod";

const optionalNumber = (min: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).pipe(max ? z.number().max(max) : z.number()).optional(),
  );

export const budgetItemSchema = z.object({
  csi_division: z.string().trim().min(1, "CSI division is required").max(20),
  description: z.string().trim().min(1, "Description is required").max(300),
  budget: optionalNumber(0),
  committed: optionalNumber(0),
  actual: optionalNumber(0),
  pct_complete: optionalNumber(0, 100),
  notes: z.string().trim().max(5000).optional().default(""),
  sort_order: optionalNumber(0),
});

export const budgetItemUpdateSchema = budgetItemSchema.partial();
export type BudgetItemInput = z.infer<typeof budgetItemSchema>;
