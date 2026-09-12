/**
 * The output contract for the Conflict & Precedence Taxonomy. AUTHORITATIVE.
 *
 * Every conflict record and provision record PocketPM emits is built by
 * `toConflictRecord` / `toProvisionRecord` here, and both validate their own
 * output before returning — an invalid record throws rather than leaving.
 * Nothing else constructs records.
 *
 * ## Reading records
 *
 * `parseConflictRecord` / `parseProvisionRecord` read `taxonomy_version` first
 * and validate against THAT version's schema, so a record written under 1.2
 * stays readable after the product moves on. An unknown version is refused
 * with the list of versions this build can read — never guessed at.
 *
 * ## Why strictObject everywhere
 *
 * A removed field — `ai_likelihood_band`, a `requires_clarification` boolean,
 * `spec_locus` — must be REJECTED, not silently dropped. A plain object schema
 * would strip it and report success, which is how a stale producer goes
 * unnoticed (docs/strict-validation-audit.md).
 */

import { z } from "zod";

import { precedenceRuleSchema } from "@/lib/validation/precedence";

import type { DetectedConflict, PrecedenceClassification, PrecedenceProvision } from "./types";
import {
  CONFLICT_CLASSES,
  E1_SUBTYPES,
  PRECEDENCE_CLASSES,
  PRECEDENCE_SCOPES,
  PROVISION_SOURCE,
  SEVERITY_BANDS,
  SUPPORTED_TAXONOMY_VERSIONS,
  TAXONOMY_VERSION,
  type SeverityBand,
  type TaxonomyVersion,
} from "./vocabulary";

export * from "./vocabulary";

/**
 * One side of a conflict.
 *
 * A drawing locus names a sheet and optionally a detail; a specification locus
 * names a section and optionally a paragraph. A locus may name neither — "the
 * Agreement" has no sheet — but never both, because a place cannot be on a
 * drawing and in a specification at once.
 */
export const locusSchema = z
  .strictObject({
    document: z.string().trim().min(1, "Name the document"),
    sheet: z.string().trim().min(1).optional(),
    detail: z.string().trim().min(1).optional(),
    section: z.string().trim().min(1).optional(),
    paragraph: z.string().trim().min(1).optional(),
    page: z.number().int().min(1).optional(),
  })
  .refine((l) => !((l.sheet || l.detail) && (l.section || l.paragraph)), {
    message: "A locus is a drawing (sheet, detail) or a specification (section, paragraph), not both.",
  });
export type ConflictLocus = z.infer<typeof locusSchema>;

const conflictRecordV1_2 = z
  .strictObject({
    conflict_id: z.string().trim().min(1),
    taxonomy_version: z.literal("1.2"),
    conflict_class: z.enum(CONFLICT_CLASSES),
    conflict_subtype: z.enum(E1_SUBTYPES).nullable(),
    /** Exactly two loci, in order. E2 is two drawings; E3 is two specifications. */
    between: z.tuple([locusSchema, locusSchema]),
    precedence_class: z.enum(PRECEDENCE_CLASSES),
    /** Never null: with no applicable provision it names the none_found record. */
    precedence_provision_ref: z.string().trim().min(1, "Every conflict cites a provision record"),
    /** Which rule fired, and what judgment it left open. */
    precedence_reasoning: z.string().trim().min(1, "Say which rule fired and what it left open"),
    governing_index: z.union([z.literal(0), z.literal(1)]).nullable(),
    ai_severity_band: z.enum(SEVERITY_BANDS),
    /** True when OVERRIDE, DISCRETION, or DEFER decided it — see provenance.ts. */
    provisional_construct_used: z.boolean(),
  })
  .superRefine((r, ctx) => {
    if (r.conflict_class === "E1" && r.conflict_subtype === null) {
      ctx.addIssue({ code: "custom", path: ["conflict_subtype"], message: "An E1 conflict must carry a subtype." });
    }
    if (r.conflict_class !== "E1" && r.conflict_subtype !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["conflict_subtype"],
        message: `Only E1 is sub-typed; an ${r.conflict_class} conflict must have a null subtype.`,
      });
    }
    const resolvable = r.precedence_class === "precedence_resolvable";
    if (resolvable && r.governing_index === null) {
      ctx.addIssue({
        code: "custom",
        path: ["governing_index"],
        message: "A resolvable conflict must say which locus governs.",
      });
    }
    if (!resolvable && r.governing_index !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["governing_index"],
        message: "Only a resolvable conflict has a governing locus.",
      });
    }
  });
export type ConflictRecord = z.infer<typeof conflictRecordV1_2>;

const provisionRecordV1_2 = z
  .strictObject({
    provision_id: z.string().trim().min(1),
    taxonomy_version: z.literal("1.2"),
    /** Section as printed, and the page, kept for traceability to the manual. */
    location: z.strictObject({
      section: z.string().trim().min(1),
      page: z.number().int().min(1).nullable(),
    }),
    scope: z.enum(PRECEDENCE_SCOPES),
    scope_target: z.string().trim().min(1).nullable(),
    rules: z.array(precedenceRuleSchema),
    /** The conflict classes this provision settles. */
    resolves: z.array(z.enum(CONFLICT_CLASSES)),
    external_instrument: z
      .strictObject({ name: z.string().trim().min(1), edition: z.string().trim().min(1).nullable() })
      .nullable(),
    /** The verbatim clause; for none_found, the searcher's note. */
    source_text: z.string().trim().min(1),
    source: z.literal(PROVISION_SOURCE),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (p.scope === "division_scoped" && p.scope_target === null) {
      issue("scope_target", "A division-scoped provision must say which division it governs.");
    }
    if (p.scope !== "division_scoped" && p.scope_target !== null) {
      issue("scope_target", "Only a division-scoped provision has a scope target.");
    }
    if (p.scope === "external" && p.external_instrument === null) {
      issue("external_instrument", "An incorporated provision must name the instrument.");
    }
    if (p.scope !== "external" && p.external_instrument !== null) {
      issue("external_instrument", "Only an incorporated provision names an external instrument.");
    }
    if ((p.scope === "external" || p.scope === "none_found") && p.rules.length > 0) {
      issue("rules", `A ${p.scope} record carries no rules: the rules are not in this document set.`);
    }
    if ((p.scope === "project_wide" || p.scope === "division_scoped") && p.rules.length === 0) {
      issue("rules", "A provision found in the manual must record at least one rule.");
    }
    if (new Set(p.resolves).size !== p.resolves.length) {
      issue("resolves", "A conflict class is listed more than once.");
    }
  });
export type ProvisionRecord = z.infer<typeof provisionRecordV1_2>;

// ── reading ────────────────────────────────────────────────────────────────

const CONFLICT_SCHEMAS = { "1.2": conflictRecordV1_2 } satisfies Record<TaxonomyVersion, unknown>;
const PROVISION_SCHEMAS = { "1.2": provisionRecordV1_2 } satisfies Record<TaxonomyVersion, unknown>;

export type ParseResult<T> = { ok: true; record: T } | { ok: false; issues: string[] };

function versionOf(value: unknown): TaxonomyVersion | null {
  const v = value && typeof value === "object" ? (value as { taxonomy_version?: unknown }).taxonomy_version : undefined;
  return (SUPPORTED_TAXONOMY_VERSIONS as readonly unknown[]).includes(v) ? (v as TaxonomyVersion) : null;
}

function unsupported(kind: string, value: unknown): { ok: false; issues: string[] } {
  const v = value && typeof value === "object" ? (value as { taxonomy_version?: unknown }).taxonomy_version : undefined;
  return {
    ok: false,
    issues: [
      `${kind} has taxonomy_version ${JSON.stringify(v ?? null)}; this build reads ${SUPPORTED_TAXONOMY_VERSIONS.join(", ")}.`,
    ],
  };
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(record)"}: ${i.message}`);
}

export function parseConflictRecord(value: unknown): ParseResult<ConflictRecord> {
  const version = versionOf(value);
  if (!version) return unsupported("Conflict record", value);
  const result = CONFLICT_SCHEMAS[version].safeParse(value);
  return result.success ? { ok: true, record: result.data } : { ok: false, issues: issuesOf(result.error) };
}

export function parseProvisionRecord(value: unknown): ParseResult<ProvisionRecord> {
  const version = versionOf(value);
  if (!version) return unsupported("Provision record", value);
  const result = PROVISION_SCHEMAS[version].safeParse(value);
  return result.success ? { ok: true, record: result.data } : { ok: false, issues: issuesOf(result.error) };
}

// ── emitting ───────────────────────────────────────────────────────────────

/** Build a provision record in the CURRENT version. Throws rather than emit an invalid one. */
export function toProvisionRecord(p: PrecedenceProvision): ProvisionRecord {
  const record = {
    provision_id: p.id,
    taxonomy_version: TAXONOMY_VERSION,
    location: { section: p.section, page: p.page ?? null },
    scope: p.scope,
    scope_target: p.scope === "division_scoped" ? p.scope_target || null : null,
    rules: p.rules,
    resolves: p.resolves,
    external_instrument:
      p.scope === "external" && p.external_instrument
        ? { name: p.external_instrument.name, edition: p.external_instrument.edition || null }
        : null,
    source_text: p.source_text,
    source: PROVISION_SOURCE,
  };
  const result = provisionRecordV1_2.safeParse(record);
  if (!result.success) {
    throw new Error(`Refusing to emit an invalid provision record: ${issuesOf(result.error).join("; ")}`);
  }
  return result.data;
}

/**
 * Build a conflict record in the CURRENT version from a classified conflict.
 *
 * Severity is an input, not something the classifier decides: it comes from
 * the severity rubric (severity-rubric.ts), applied by whatever detects the
 * conflict. Throws rather than emit an invalid record.
 */
export function toConflictRecord(input: {
  conflictId: string;
  conflict: DetectedConflict;
  classification: PrecedenceClassification;
  severity: SeverityBand;
}): ConflictRecord {
  const { conflictId, conflict, classification, severity } = input;
  const record = {
    conflict_id: conflictId,
    taxonomy_version: TAXONOMY_VERSION,
    conflict_class: conflict.conflict_class,
    conflict_subtype: conflict.conflict_subtype ?? null,
    between: conflict.between,
    precedence_class: classification.class,
    precedence_provision_ref: classification.provisionId,
    precedence_reasoning: classification.explanation,
    governing_index: classification.governingIndex,
    ai_severity_band: severity,
    provisional_construct_used: classification.provisional,
  };
  const result = conflictRecordV1_2.safeParse(record);
  if (!result.success) {
    throw new Error(`Refusing to emit an invalid conflict record: ${issuesOf(result.error).join("; ")}`);
  }
  return result.data;
}
