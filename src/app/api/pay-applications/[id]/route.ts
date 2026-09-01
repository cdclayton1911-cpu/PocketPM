import { createCollectionRoute } from "@/lib/crud-route";
import { payApplicationSchema, payApplicationUpdateSchema } from "@/lib/validation/pay-application";

const routes = createCollectionRoute({
  collection: "pay_applications",
  createSchema: payApplicationSchema,
  updateSchema: payApplicationUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/pay-applications/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
