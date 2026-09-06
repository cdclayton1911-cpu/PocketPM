import { createCollectionRoute } from "@/lib/crud-route";
import { startWorkflow } from "@/lib/workflow/engine";
import { submittalSchema, submittalUpdateSchema } from "@/lib/validation/submittal";

const routes = createCollectionRoute({
  collection: "submittals",
  createSchema: submittalSchema,
  updateSchema: submittalUpdateSchema,
  defaultSort: "-created",
  // A new submittal has not been sent to the A/E yet.
  createDefaults: { disposition: "pending" },
  // Start a workflow if the project has one configured. A null return means no
  // active template, and the record behaves exactly as it did before workflows
  // existed — which is the state every project is in until an admin seeds one.
  afterCreate: async (pb, record, session) => {
    await startWorkflow(pb, "submittal", record.id, session.user.id);
  },
});

export const GET = routes.GET;
export const POST = routes.POST;
