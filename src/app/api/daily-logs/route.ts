import { createCollectionRoute } from "@/lib/crud-route";
import { dailyLogSchema, dailyLogUpdateSchema } from "@/lib/validation/daily-log";

const routes = createCollectionRoute({
  collection: "daily_logs",
  createSchema: dailyLogSchema,
  updateSchema: dailyLogUpdateSchema,
  // Newest day first. Sorted by the field rather than by `created`, so a log
  // back-filled on Monday for Friday still lands on Friday.
  defaultSort: "-log_date",
});

export const GET = routes.GET;
export const POST = routes.POST;
