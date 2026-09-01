import { createCollectionRoute } from "@/lib/crud-route";
import { submittalSchema, submittalUpdateSchema } from "@/lib/validation/submittal";

const routes = createCollectionRoute({
  collection: "submittals",
  createSchema: submittalSchema,
  updateSchema: submittalUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/submittals/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
