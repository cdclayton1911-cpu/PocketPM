import { createCollectionRoute } from "@/lib/crud-route";
import { drawingSchema, drawingUpdateSchema } from "@/lib/validation/drawing";

const routes = createCollectionRoute({
  collection: "drawings",
  createSchema: drawingSchema,
  updateSchema: drawingUpdateSchema,
  // A drawing register is read by sheet number.
  defaultSort: "sheet_number",
  createDefaults: { status: "current", discipline: "Architectural" },
});

export const GET = routes.GET;
export const POST = routes.POST;
