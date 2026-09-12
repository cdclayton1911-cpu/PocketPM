import { createCollectionRoute } from "@/lib/crud-route";
import { PROVISION_SOURCE, TAXONOMY_VERSION } from "@/lib/precedence/vocabulary";
import {
  precedenceProvisionSchema,
  precedenceProvisionUpdateSchema,
} from "@/lib/validation/precedence";

/**
 * Precedence provisions, recorded by a person rather than extracted.
 *
 * `recorded_by` is stamped server-side. Who confirmed a provision is part of
 * its traceability — a classification downstream cites this record, and "who
 * said so" is a question a claim will ask.
 */
const routes = createCollectionRoute({
  collection: "precedence_provisions",
  createSchema: precedenceProvisionSchema,
  updateSchema: precedenceProvisionUpdateSchema,
  defaultSort: "section",
  ownerField: "recorded_by",
  // Stamped on create so every stored provision says which taxonomy version it
  // was recorded under, and that a person supplied and confirmed it.
  createDefaults: { taxonomy_version: TAXONOMY_VERSION, source: PROVISION_SOURCE },
});

export const GET = routes.GET;
export const POST = routes.POST;
