import { createCollectionRoute } from "@/lib/crud-route";
import { dfowSchema, dfowUpdateSchema } from "@/lib/validation/dfow";

const routes = createCollectionRoute({
  collection: "dfow",
  createSchema: dfowSchema,
  updateSchema: dfowUpdateSchema,
  defaultSort: "dfow_number",
  // CQM-C: a feature of work begins before its preparatory meeting.
  createDefaults: { phase: "not_started" },
});

export const GET = routes.GET;
export const POST = routes.POST;
