import { z } from "zod";

/**
 * A recorded precedence provision.
 *
 * strictObject per docs/strict-validation-audit.md: an unlisted key is rejected
 * rather than silently dropped.
 *
 * `rules` is an ordered decision procedure, validated as a discriminated union
 * so a malformed rule is refused at the edge rather than producing a classifier
 * that quietly never fires. A provision that cannot be applied is worse than
 * none, because everything downstream will cite it.
 */
const rankTier = z.array(z.string().trim().min(1).max(120)).min(1).max(12);

export const precedenceRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("OVERRIDE"),
    applies_to: z.string().trim().min(1, "Name the document that overrides").max(120),
    precedence: z.literal("ABSOLUTE").optional(),
    note: z.string().trim().max(200).optional(),
  }),
  z.strictObject({
    type: z.literal("RANK_SEQUENCE"),
    // A tier with more than one entry is TIED, which is what makes a conflict
    // within it fall through to the rules below.
    order: z.array(rankTier).min(2, "A sequence needs at least two tiers").max(20),
  }),
  z.strictObject({
    type: z.literal("STRINGENCY"),
    condition: z.string().trim().max(200).optional(),
  }),
  z.strictObject({
    type: z.literal("DISCRETION"),
    authority: z.string().trim().min(1, "Name who decides").max(120),
  }),
]);

export const precedenceProvisionSchema = z
  .strictObject({
    section: z.string().trim().min(1, "Give the section identifier").max(60),
    page: z.coerce.number().int().min(1).max(20000).nullable().optional(),
    scope: z.enum(["PROJECT_WIDE", "DIVISION_SCOPED", "EXTERNAL", "NONE_FOUND"]),
    scope_target: z.string().trim().max(40).optional().default(""),
    rules: z.array(precedenceRuleSchema).max(20).optional().default([]),
    resolves_drawing_vs_spec: z.coerce.boolean().optional(),
    external_instrument_name: z.string().trim().max(200).optional().default(""),
    external_instrument_edition: z.string().trim().max(60).optional().default(""),
    /**
     * Required, and required at the database too. Traceability to the page is
     * the point: a classification that cannot be checked against the manual is
     * not usable for a claim.
     */
    source_text: z
      .string()
      .trim()
      .min(20, "Paste the provision text exactly as it appears in the manual")
      .max(20000),
    notes: z.string().trim().max(4000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "DIVISION_SCOPED" && !v.scope_target) {
      ctx.addIssue({
        code: "custom",
        path: ["scope_target"],
        message: "Say which division or section this governs — otherwise it cannot be applied.",
      });
    }
    if (v.scope === "EXTERNAL" && !v.external_instrument_name) {
      ctx.addIssue({
        code: "custom",
        path: ["external_instrument_name"],
        message: "Name the incorporated instrument, e.g. AIA A201.",
      });
    }
    // An EXTERNAL provision points elsewhere; rules recorded against it would
    // never be reached and would misrepresent what is known.
    if (v.scope === "EXTERNAL" && v.rules.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "An incorporated instrument is not in this set, so no rules can be recorded from it.",
      });
    }
    if (v.scope !== "EXTERNAL" && v.rules.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Record at least one rule, or the provision cannot classify anything.",
      });
    }
  });

/**
 * The unrefined field object, kept apart so an edit schema can be built from it.
 * `.partial()` THROWS on a schema carrying an object-level refinement — the
 * fc704da crash, guarded by src/lib/validation/partial-safety.test.ts.
 */
export const precedenceProvisionUpdateSchema = z.strictObject({
  section: z.string().trim().min(1).max(60).optional(),
  page: z.coerce.number().int().min(1).max(20000).nullable().optional(),
  scope: z.enum(["PROJECT_WIDE", "DIVISION_SCOPED", "EXTERNAL", "NONE_FOUND"]).optional(),
  scope_target: z.string().trim().max(40).optional(),
  rules: z.array(precedenceRuleSchema).max(20).optional(),
  resolves_drawing_vs_spec: z.coerce.boolean().optional(),
  external_instrument_name: z.string().trim().max(200).optional(),
  external_instrument_edition: z.string().trim().max(60).optional(),
  source_text: z.string().trim().min(20).max(20000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type PrecedenceProvisionInput = z.infer<typeof precedenceProvisionUpdateSchema>;
