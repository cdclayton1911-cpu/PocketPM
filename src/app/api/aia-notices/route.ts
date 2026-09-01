import { createCollectionRoute } from "@/lib/crud-route";
import { aiaNoticeSchema, aiaNoticeUpdateSchema } from "@/lib/validation/aia-notice";

const routes = createCollectionRoute({
  collection: "aia_notices",
  createSchema: aiaNoticeSchema,
  updateSchema: aiaNoticeUpdateSchema,
  // Soonest deadline first: this module exists to stop one being missed.
  defaultSort: "notice_deadline",
  createDefaults: { status: "upcoming" },
});

export const GET = routes.GET;
export const POST = routes.POST;
