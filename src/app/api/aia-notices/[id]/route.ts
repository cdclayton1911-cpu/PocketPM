import { createCollectionRoute } from "@/lib/crud-route";
import { aiaNoticeSchema, aiaNoticeUpdateSchema } from "@/lib/validation/aia-notice";

const routes = createCollectionRoute({
  collection: "aia_notices",
  createSchema: aiaNoticeSchema,
  updateSchema: aiaNoticeUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/aia-notices/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
