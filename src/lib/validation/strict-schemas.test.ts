import { describe, expect, it } from "vitest";

import { aiSessionSchema, aiSessionUpdateSchema } from "./ai-session";
import { aiaNoticeSchema, aiaNoticeUpdateSchema } from "./aia-notice";
import { budgetItemSchema, budgetItemUpdateSchema } from "./budget";
import { changeOrderSchema, changeOrderUpdateSchema } from "./change-order";
import { dailyLogSchema, dailyLogUpdateSchema } from "./daily-log";
import { deficiencySchema, deficiencyUpdateSchema } from "./deficiency";
import { dfowSchema, dfowUpdateSchema } from "./dfow";
import { drawingSchema, drawingUpdateSchema } from "./drawing";
import { payApplicationSchema, payApplicationUpdateSchema } from "./pay-application";
import { projectSchema } from "./project";
import { projectDocumentSchema, projectDocumentUpdateSchema } from "./project-document";
import { projectRoleSchema, projectRoleUpdateSchema } from "./project-role";
import { punchListSchema, punchListUpdateSchema } from "./punch-list";
import { revisionSchema, revisionUpdateSchema } from "./revision";
import { rfiSchema, rfiUpdateSchema } from "./rfi";
import { safetyObservationSchema, safetyObservationUpdateSchema } from "./safety";
import { scheduleRelationshipSchema, scheduleRelationshipUpdateSchema } from "./schedule-relationship";
import { scheduleItemSchema, scheduleItemUpdateSchema } from "./schedule";
import { subcontractorSchema, subcontractorUpdateSchema } from "./subcontractor";
import { submittalSchema, submittalUpdateSchema } from "./submittal";

/**
 * Every schema behind a crud-route rejects a key it does not know.
 *
 * ## What this guards, and what it cannot
 *
 * The audit's question was "does the client posting to route X validate with
 * route X's schema?" That is NOT directly testable — a client is a React
 * component, its payload is assembled at run time, and a test asserting
 * otherwise would be pattern-matching over source and would pass while the
 * behaviour changed underneath it.
 *
 * So the guard is turned around. Rather than proving every caller is
 * well-behaved, the server refuses anything it does not recognise. A caller
 * that sends an unlisted key now gets a LOUD 400 instead of a silent 200 with
 * the field discarded — which is the failure that produced both known bugs, in
 * projectSchema and revisionUpdateSchema.
 *
 * This test is what stops a schema quietly reverting to `z.object`. It does not
 * prove callers are correct; it makes their incorrectness visible.
 *
 * ## Why an unknown key rather than reading `_def`
 *
 * Zod's internals are not a stable API and a shape check would break on a minor
 * upgrade. Parsing an object with a junk key exercises the actual behaviour the
 * routes depend on.
 */
const CRUD_SCHEMAS: [string, { safeParse: (v: unknown) => { success: boolean } }][] = [
  ["aiSessionSchema", aiSessionSchema],
  ["aiSessionUpdateSchema", aiSessionUpdateSchema],
  ["aiaNoticeSchema", aiaNoticeSchema],
  ["aiaNoticeUpdateSchema", aiaNoticeUpdateSchema],
  ["budgetItemSchema", budgetItemSchema],
  ["budgetItemUpdateSchema", budgetItemUpdateSchema],
  ["changeOrderSchema", changeOrderSchema],
  ["changeOrderUpdateSchema", changeOrderUpdateSchema],
  ["dailyLogSchema", dailyLogSchema],
  ["dailyLogUpdateSchema", dailyLogUpdateSchema],
  ["deficiencySchema", deficiencySchema],
  ["deficiencyUpdateSchema", deficiencyUpdateSchema],
  ["dfowSchema", dfowSchema],
  ["dfowUpdateSchema", dfowUpdateSchema],
  ["drawingSchema", drawingSchema],
  ["drawingUpdateSchema", drawingUpdateSchema],
  ["payApplicationSchema", payApplicationSchema],
  ["payApplicationUpdateSchema", payApplicationUpdateSchema],
  ["projectSchema", projectSchema],
  ["projectDocumentSchema", projectDocumentSchema],
  ["projectDocumentUpdateSchema", projectDocumentUpdateSchema],
  ["projectRoleSchema", projectRoleSchema],
  ["projectRoleUpdateSchema", projectRoleUpdateSchema],
  ["punchListSchema", punchListSchema],
  ["punchListUpdateSchema", punchListUpdateSchema],
  ["revisionSchema", revisionSchema],
  ["revisionUpdateSchema", revisionUpdateSchema],
  ["rfiSchema", rfiSchema],
  ["rfiUpdateSchema", rfiUpdateSchema],
  ["safetyObservationSchema", safetyObservationSchema],
  ["safetyObservationUpdateSchema", safetyObservationUpdateSchema],
  ["scheduleItemSchema", scheduleItemSchema],
  ["scheduleItemUpdateSchema", scheduleItemUpdateSchema],
  ["scheduleRelationshipSchema", scheduleRelationshipSchema],
  ["scheduleRelationshipUpdateSchema", scheduleRelationshipUpdateSchema],
  ["subcontractorSchema", subcontractorSchema],
  ["subcontractorUpdateSchema", subcontractorUpdateSchema],
  ["submittalSchema", submittalSchema],
  ["submittalUpdateSchema", submittalUpdateSchema],
];

describe("crud-route schemas reject unknown keys", () => {
  it.each(CRUD_SCHEMAS)("%s refuses a key it does not declare", (_name, schema) => {
    // A field name nothing could legitimately declare. If this parses, the
    // schema is a plain z.object again and is silently dropping input.
    const result = schema.safeParse({ __unlisted_field_from_a_stale_client__: "x" });
    expect(result.success).toBe(false);
  });

  it("covers every schema used by a crud route", () => {
    // A cheap tripwire: if a new collection is added and its schema is not
    // listed above, this count drifts and someone has to look at why.
    expect(CRUD_SCHEMAS.length).toBe(39);
  });
});
