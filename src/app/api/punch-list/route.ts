import { createCollectionRoute } from "@/lib/crud-route";
import { punchListSchema, punchListUpdateSchema } from "@/lib/validation/punch-list";

// URL segment is hyphenated; the PocketBase collection is punch_list.
const routes = createCollectionRoute({
  collection: "punch_list",
  createSchema: punchListSchema,
  updateSchema: punchListUpdateSchema,
  defaultSort: "-created",
  createDefaults: { status: "open", priority: "medium" },
});

export const GET = routes.GET;
export const POST = routes.POST;
