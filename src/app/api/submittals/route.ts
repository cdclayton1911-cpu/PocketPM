import { createCollectionRoute } from "@/lib/crud-route";
import { submittalSchema, submittalUpdateSchema } from "@/lib/validation/submittal";

const routes = createCollectionRoute({
  collection: "submittals",
  createSchema: submittalSchema,
  updateSchema: submittalUpdateSchema,
  defaultSort: "-created",
  // A new submittal has not been sent to the A/E yet.
  createDefaults: { disposition: "pending" },
});

export const GET = routes.GET;
export const POST = routes.POST;
