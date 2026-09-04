import { createCollectionRoute } from "@/lib/crud-route";
import { revisionSchema, revisionUpdateSchema } from "@/lib/validation/revision";

const routes = createCollectionRoute({
  collection: "document_revisions",
  createSchema: revisionSchema,
  updateSchema: revisionUpdateSchema,
  // Oldest first: a revision history reads Rev 0, Rev 1, Rev 2.
  defaultSort: "revision_number",
  createDefaults: { status: "draft", is_current: false },
  filterable: ["submittal", "rfi"],
  ownerField: "created_by",
});

export const GET = routes.GET;
export const POST = routes.POST;
