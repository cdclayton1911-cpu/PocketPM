import { createCollectionRoute } from "@/lib/crud-route";
import { subcontractorSchema, subcontractorUpdateSchema } from "@/lib/validation/subcontractor";

const routes = createCollectionRoute({
  collection: "subcontractors",
  createSchema: subcontractorSchema,
  updateSchema: subcontractorUpdateSchema,
});

/**
 * There is no DELETE. Removal is a soft delete — PATCH `status: "inactive"` —
 * because five collections reference subcontractors with `cascadeDelete: false`,
 * so a hard delete would orphan submittals, punch list items, DFOWs,
 * deficiencies, and safety observations. See docs/schema-notes.md.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/subcontractors/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
