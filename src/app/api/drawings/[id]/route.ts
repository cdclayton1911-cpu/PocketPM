import { createCollectionRoute } from "@/lib/crud-route";
import { drawingSchema, drawingUpdateSchema } from "@/lib/validation/drawing";

const routes = createCollectionRoute({
  collection: "drawings",
  createSchema: drawingSchema,
  updateSchema: drawingUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/drawings/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
