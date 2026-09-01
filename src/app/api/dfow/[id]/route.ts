import { createCollectionRoute } from "@/lib/crud-route";
import { dfowSchema, dfowUpdateSchema } from "@/lib/validation/dfow";

const routes = createCollectionRoute({
  collection: "dfow",
  createSchema: dfowSchema,
  updateSchema: dfowUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/dfow/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
