import { createCollectionRoute } from "@/lib/crud-route";
import {
  precedenceProvisionSchema,
  precedenceProvisionUpdateSchema,
} from "@/lib/validation/precedence";

const routes = createCollectionRoute({
  collection: "precedence_provisions",
  createSchema: precedenceProvisionSchema,
  updateSchema: precedenceProvisionUpdateSchema,
});

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/precedence-provisions/[id]">,
) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
