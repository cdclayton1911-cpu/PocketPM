import { createCollectionRoute } from "@/lib/crud-route";
import { subcontractorSchema, subcontractorUpdateSchema } from "@/lib/validation/subcontractor";

const routes = createCollectionRoute({
  collection: "subcontractors",
  createSchema: subcontractorSchema,
  updateSchema: subcontractorUpdateSchema,
  defaultSort: "-created",
  // Matches the prototype's addSubLive(): a new subcontractor starts
  // unqualified until its documents are on file.
  createDefaults: { status: "pending_docs" },
});

export const GET = routes.GET;
export const POST = routes.POST;
