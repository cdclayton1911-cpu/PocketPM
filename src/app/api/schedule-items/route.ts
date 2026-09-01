import { createCollectionRoute } from "@/lib/crud-route";
import { scheduleItemSchema, scheduleItemUpdateSchema } from "@/lib/validation/schedule";

const routes = createCollectionRoute({
  collection: "schedule_items",
  createSchema: scheduleItemSchema,
  updateSchema: scheduleItemUpdateSchema,
  // A schedule reads chronologically, not by when rows were entered.
  defaultSort: "sort_order,planned_start",
  createDefaults: { status: "not_started" },
});

export const GET = routes.GET;
export const POST = routes.POST;
