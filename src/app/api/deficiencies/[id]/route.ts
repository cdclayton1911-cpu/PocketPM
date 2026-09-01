import { createCollectionRoute } from "@/lib/crud-route";
import { deficiencySchema, deficiencyUpdateSchema } from "@/lib/validation/deficiency";

const routes = createCollectionRoute({
  collection: "deficiencies",
  createSchema: deficiencySchema,
  updateSchema: deficiencyUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/deficiencies/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
