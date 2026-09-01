import { createCollectionRoute } from "@/lib/crud-route";
import { rfiSchema, rfiUpdateSchema } from "@/lib/validation/rfi";

const routes = createCollectionRoute({
  collection: "rfis",
  createSchema: rfiSchema,
  updateSchema: rfiUpdateSchema,
  defaultSort: "-created",
  // A new RFI is open and of unknown cost impact until the A/E responds.
  createDefaults: { status: "open", cost_impact: "unknown", priority: "standard" },
});

export const GET = routes.GET;
export const POST = routes.POST;
