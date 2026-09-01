import { createCollectionRoute } from "@/lib/crud-route";
import { safetyObservationSchema, safetyObservationUpdateSchema } from "@/lib/validation/safety";

const routes = createCollectionRoute({
  collection: "safety_observations",
  createSchema: safetyObservationSchema,
  updateSchema: safetyObservationUpdateSchema,
  // Safety is read most-recent-first: today's walk matters most.
  defaultSort: "-obs_date",
  createDefaults: { status: "open", type: "observation", severity: "minor" },
});

export const GET = routes.GET;
export const POST = routes.POST;
