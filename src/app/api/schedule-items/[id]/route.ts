import { createCollectionRoute } from "@/lib/crud-route";
import { scheduleItemSchema, scheduleItemUpdateSchema } from "@/lib/validation/schedule";

const routes = createCollectionRoute({
  collection: "schedule_items",
  createSchema: scheduleItemSchema,
  updateSchema: scheduleItemUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/schedule-items/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
