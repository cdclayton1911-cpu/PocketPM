import { createCollectionRoute } from "@/lib/crud-route";
import { dailyLogSchema, dailyLogUpdateSchema } from "@/lib/validation/daily-log";

const routes = createCollectionRoute({
  collection: "daily_logs",
  createSchema: dailyLogSchema,
  updateSchema: dailyLogUpdateSchema,
});

export async function PATCH(request: Request, { params }: RouteContext<"/api/daily-logs/[id]">) {
  const { id } = await params;
  return routes.PATCH(request, id);
}
