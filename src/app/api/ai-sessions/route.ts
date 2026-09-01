import { createCollectionRoute } from "@/lib/crud-route";
import { aiSessionSchema, aiSessionUpdateSchema } from "@/lib/validation/ai-session";

/**
 * Saved AI outputs, one record per generation.
 *
 * `user` is stamped server-side: the collection's rules are
 * `user = @request.auth.id`, so a client-supplied value would let a caller
 * file a record under someone else's name.
 */
const routes = createCollectionRoute({
  collection: "ai_sessions",
  createSchema: aiSessionSchema,
  updateSchema: aiSessionUpdateSchema,
  defaultSort: "-created",
  ownerField: "user",
});

export const GET = routes.GET;
export const POST = routes.POST;
