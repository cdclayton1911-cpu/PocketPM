import { describe, expect, it } from "vitest";

import { aiaNoticeSchema } from "./aia-notice";
import { budgetItemSchema } from "./budget";
import { changeOrderSchema } from "./change-order";
import { dailyLogSchema } from "./daily-log";
import { deficiencySchema } from "./deficiency";
import { dfowSchema } from "./dfow";
import { drawingSchema } from "./drawing";
import { payApplicationSchema } from "./pay-application";
import { projectSchema } from "./project";
import { projectDocumentSchema } from "./project-document";
import { punchListSchema } from "./punch-list";
import { rfiSchema } from "./rfi";
import { safetyObservationSchema } from "./safety";
import { scheduleItemSchema } from "./schedule";
import { subcontractorSchema } from "./subcontractor";
import { submittalSchema } from "./submittal";

/**
 * Every schema a dialog calls `.partial()` on, executed.
 *
 * This is the fc704da regression generalised. Zod THROWS on `.partial()` when a
 * schema carries an OBJECT-level refinement, and TypeScript cannot catch it -
 * `.partial` exists on the type and fails only at run time. In ProjectRoleDialog
 * that killed the submit handler before it sent anything, and presented as a
 * failing write when the server had never been contacted.
 *
 * A field-level `.refine()` is fine and common here (pay_applications validates
 * sov_json that way); only a refinement applied to the whole object is fatal.
 * The difference is invisible to a grep, which is why this executes instead.
 *
 * If a schema gains an object-level refinement later, this fails and names it -
 * and the fix is to keep the unrefined object separate, as
 * workflow-template.ts does.
 */
const DIALOG_SCHEMAS: [string, { partial: () => unknown }][] = [
  ["aiaNoticeSchema", aiaNoticeSchema],
  ["budgetItemSchema", budgetItemSchema],
  ["changeOrderSchema", changeOrderSchema],
  ["dailyLogSchema", dailyLogSchema],
  ["deficiencySchema", deficiencySchema],
  ["dfowSchema", dfowSchema],
  ["drawingSchema", drawingSchema],
  ["payApplicationSchema", payApplicationSchema],
  ["projectSchema", projectSchema],
  ["projectDocumentSchema", projectDocumentSchema],
  ["punchListSchema", punchListSchema],
  ["rfiSchema", rfiSchema],
  ["safetyObservationSchema", safetyObservationSchema],
  ["scheduleItemSchema", scheduleItemSchema],
  ["subcontractorSchema", subcontractorSchema],
  ["submittalSchema", submittalSchema],
];

describe("dialogs can build an edit schema", () => {
  it.each(DIALOG_SCHEMAS)("%s.partial() does not throw", (_name, schema) => {
    expect(() => schema.partial()).not.toThrow();
  });
});
