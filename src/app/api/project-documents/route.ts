import { createCollectionRoute } from "@/lib/crud-route";
import {
  projectDocumentSchema,
  projectDocumentUpdateSchema,
} from "@/lib/validation/project-document";

const routes = createCollectionRoute({
  collection: "project_documents",
  createSchema: projectDocumentSchema,
  updateSchema: projectDocumentUpdateSchema,
  defaultSort: "-created",
  // A newly filed document is the one in force until someone says otherwise;
  // the alternative — defaulting to false — leaves a register where nothing is
  // current, which is the state this flag exists to prevent.
  createDefaults: { is_current: true },
  filterable: ["category"],
  ownerField: "uploaded_by",
});

export const GET = routes.GET;
export const POST = routes.POST;
