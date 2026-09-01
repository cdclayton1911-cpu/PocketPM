import { createCollectionRoute } from "@/lib/crud-route";
import { budgetItemSchema, budgetItemUpdateSchema } from "@/lib/validation/budget";

const routes = createCollectionRoute({
  collection: "budget_items",
  createSchema: budgetItemSchema,
  updateSchema: budgetItemUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/budget-items/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
