import { createCollectionRoute } from "@/lib/crud-route";
import { rfiSchema, rfiUpdateSchema } from "@/lib/validation/rfi";

const routes = createCollectionRoute({
  collection: "rfis",
  createSchema: rfiSchema,
  updateSchema: rfiUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/rfis/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
