import { createCollectionRoute } from "@/lib/crud-route";
import { changeOrderSchema, changeOrderUpdateSchema } from "@/lib/validation/change-order";

const routes = createCollectionRoute({
  collection: "change_orders",
  createSchema: changeOrderSchema,
  updateSchema: changeOrderUpdateSchema,
  defaultSort: "co_number",
  // Work starts as a potential change order until it is priced and accepted.
  createDefaults: { status: "draft", type: "PCO" },
});

export const GET = routes.GET;
export const POST = routes.POST;
