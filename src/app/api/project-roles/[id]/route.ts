import { createCollectionRoute } from "@/lib/crud-route";
import { projectRoleSchema, projectRoleUpdateSchema } from "@/lib/validation/project-role";

const routes = createCollectionRoute({
  collection: "project_roles",
  createSchema: projectRoleSchema,
  updateSchema: projectRoleUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/project-roles/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
