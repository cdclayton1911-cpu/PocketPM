import { createCollectionRoute } from "@/lib/crud-route";
import { punchListSchema, punchListUpdateSchema } from "@/lib/validation/punch-list";

const routes = createCollectionRoute({
  collection: "punch_list",
  createSchema: punchListSchema,
  updateSchema: punchListUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/punch-list/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
