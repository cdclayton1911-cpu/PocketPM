import { createCollectionRoute } from "@/lib/crud-route";
import { budgetItemSchema, budgetItemUpdateSchema } from "@/lib/validation/budget";

const routes = createCollectionRoute({
  collection: "budget_items",
  createSchema: budgetItemSchema,
  updateSchema: budgetItemUpdateSchema,
  // Budget reads as a schedule of values, so order by division, not recency.
  defaultSort: "sort_order,csi_division",
});

export const GET = routes.GET;
export const POST = routes.POST;
