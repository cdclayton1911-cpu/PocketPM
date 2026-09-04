import { createCollectionRoute } from "@/lib/crud-route";
import {
  projectDocumentSchema,
  projectDocumentUpdateSchema,
} from "@/lib/validation/project-document";

const routes = createCollectionRoute({
  collection: "project_documents",
  createSchema: projectDocumentSchema,
  updateSchema: projectDocumentUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/project-documents/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
