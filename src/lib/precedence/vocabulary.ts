/**
 * The taxonomy's vocabulary: its version and every enum it uses.
 *
 * Part of the output contract (see contract.ts, which re-exports all of this).
 * Kept in its own module so the contract and the validators can both import it
 * without importing each other.
 *
 * ## Versions
 *
 * `taxonomy-v1.2` is the praxis evaluation baseline (a git tag). The product
 * may move to 1.3+: add the version to SUPPORTED_TAXONOMY_VERSIONS, give it
 * schemas in contract.ts, and point TAXONOMY_VERSION at it. Records carry their
 * own `taxonomy_version`, so a 1.2 record is always read with the 1.2 schema.
 * A released version's vocabulary is never edited.
 */

export const TAXONOMY_VERSION = "1.2" as const;
export const SUPPORTED_TAXONOMY_VERSIONS = ["1.2"] as const;
export type TaxonomyVersion = (typeof SUPPORTED_TAXONOMY_VERSIONS)[number];

/** Provisions are recorded by a person and confirmed — never extracted. */
export const PROVISION_SOURCE = "human_supplied_and_confirmed" as const;

/** Decided from the documents alone, BEFORE precedence is assessed. */
export const CONFLICT_CLASSES = ["E1", "E2", "E3", "E4", "E5"] as const;
export type ConflictClass = (typeof CONFLICT_CLASSES)[number];

/** Only E1 is sub-typed. */
export const E1_SUBTYPES = [
  "material_type",
  "material_thickness",
  "system_type",
  "frame_material",
  "dimension_spacing",
  "grade_standard",
  "performance_rating",
  "method_sequence",
  "beneficial_exceedance",
] as const;
export type E1Subtype = (typeof E1_SUBTYPES)[number];

/** What the applicable provision can do about a conflict. */
export const PRECEDENCE_CLASSES = [
  "precedence_resolvable",
  "precedence_ambiguous",
  "precedence_incorporated",
  "requires_clarification",
  "no_precedence_provision",
] as const;
export type PrecedenceClass = (typeof PRECEDENCE_CLASSES)[number];

/** Where a provision applies. */
export const PRECEDENCE_SCOPES = ["project_wide", "division_scoped", "external", "none_found"] as const;
export type PrecedenceScope = (typeof PRECEDENCE_SCOPES)[number];

/**
 * How much a conflict matters to a GC. Defined in severity-rubric.ts:
 * low is pricing only, medium is rework or delay if built as shown, high is
 * life safety, code compliance, or structural adequacy.
 */
export const SEVERITY_BANDS = ["low", "medium", "high"] as const;
export type SeverityBand = (typeof SEVERITY_BANDS)[number];
