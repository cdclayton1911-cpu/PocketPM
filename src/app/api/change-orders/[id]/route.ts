import { createCollectionRoute } from "@/lib/crud-route";
import { changeOrderSchema, changeOrderUpdateSchema } from "@/lib/validation/change-order";

const routes = createCollectionRoute({
  collection: "change_orders",
  createSchema: changeOrderSchema,
  updateSchema: changeOrderUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/change-orders/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
