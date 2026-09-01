import { createCollectionRoute } from "@/lib/crud-route";
import { safetyObservationSchema, safetyObservationUpdateSchema } from "@/lib/validation/safety";

const routes = createCollectionRoute({
  collection: "safety_observations",
  createSchema: safetyObservationSchema,
  updateSchema: safetyObservationUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/safety-observations/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
