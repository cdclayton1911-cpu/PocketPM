import { createCollectionRoute } from "@/lib/crud-route";
import { projectRoleSchema, projectRoleUpdateSchema } from "@/lib/validation/project-role";

const routes = createCollectionRoute({
  collection: "project_roles",
  createSchema: projectRoleSchema,
  updateSchema: projectRoleUpdateSchema,
  defaultSort: "role",
  createDefaults: { status: "active" },
  filterable: ["role"],
});

export const GET = routes.GET;
export const POST = routes.POST;
