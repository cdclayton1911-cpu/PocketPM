import { createCollectionRoute } from "@/lib/crud-route";
import { payApplicationSchema, payApplicationUpdateSchema } from "@/lib/validation/pay-application";

const routes = createCollectionRoute({
  collection: "pay_applications",
  createSchema: payApplicationSchema,
  updateSchema: payApplicationUpdateSchema,
  // Applications read newest-first: the current one is what matters.
  defaultSort: "-app_number",
  createDefaults: { status: "draft", retainage_pct: 5 },
});

export const GET = routes.GET;
export const POST = routes.POST;
