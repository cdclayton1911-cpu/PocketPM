import { createCollectionRoute } from "@/lib/crud-route";
import { deficiencySchema, deficiencyUpdateSchema } from "@/lib/validation/deficiency";

const routes = createCollectionRoute({
  collection: "deficiencies",
  createSchema: deficiencySchema,
  updateSchema: deficiencyUpdateSchema,
  defaultSort: "-created",
  createDefaults: { status: "open", severity: "major" },
});

export const GET = routes.GET;
export const POST = routes.POST;
