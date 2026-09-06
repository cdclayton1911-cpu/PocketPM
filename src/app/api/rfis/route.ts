import { createCollectionRoute } from "@/lib/crud-route";
import { startWorkflow } from "@/lib/workflow/engine";
import { rfiSchema, rfiUpdateSchema } from "@/lib/validation/rfi";

const routes = createCollectionRoute({
  collection: "rfis",
  createSchema: rfiSchema,
  updateSchema: rfiUpdateSchema,
  defaultSort: "-created",
  // A new RFI is open and of unknown cost impact until the A/E responds.
  createDefaults: { status: "open", cost_impact: "unknown", priority: "standard" },
  // Start a workflow if the project has one configured. A null return means no
  // active template, and the record behaves exactly as it did before workflows
  // existed — which is the state every project is in until an admin seeds one.
  afterCreate: async (pb, record, session) => {
    await startWorkflow(pb, "rfi", record.id, session.user.id);
  },
});

export const GET = routes.GET;
export const POST = routes.POST;
