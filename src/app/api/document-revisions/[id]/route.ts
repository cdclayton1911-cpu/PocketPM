import { createCollectionRoute } from "@/lib/crud-route";
import { revisionSchema, revisionUpdateSchema } from "@/lib/validation/revision";

const routes = createCollectionRoute({
  collection: "document_revisions",
  createSchema: revisionSchema,
  updateSchema: revisionUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/document-revisions/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
