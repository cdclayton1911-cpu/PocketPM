/**
 * Plain GC language for every taxonomy value. The ONLY place UI text for these
 * enums comes from.
 *
 * Internal values such as `precedence_resolvable` never reach the screen. A
 * test (labels.test.ts) fails if any value has no label, or if a label is just
 * its internal value — so adding an enum value without wording it for a GC
 * cannot pass.
 */

import type {
  ConflictClass,
  E1Subtype,
  PrecedenceClass,
  PrecedenceScope,
  SeverityBand,
} from "./vocabulary";

export const PRECEDENCE_CLASS_LABEL: Record<PrecedenceClass, { label: string; hint: string }> = {
  precedence_resolvable: {
    label: "Contract settles it",
    hint: "Your order-of-precedence clause says which document wins.",
  },
  precedence_ambiguous: {
    label: "Contract leaves it to judgment",
    hint: "The clause says the more stringent requirement applies, or leaves it to the architect. Someone has to decide.",
  },
  precedence_incorporated: {
    label: "Answer is in a referenced document",
    hint: "The contract points to a standard form, such as AIA A201, that isn't in your document set.",
  },
  requires_clarification: {
    label: "Needs an RFI",
    hint: "The contract has a precedence clause, but it doesn't cover this kind of conflict.",
  },
  no_precedence_provision: {
    label: "No clause covers this",
    hint: "Nothing in the contract decides which document wins here.",
  },
};

export const SEVERITY_LABEL: Record<SeverityBand, { label: string; hint: string }> = {
  low: { label: "Pricing only", hint: "Affects price, not whether the work is right." },
  medium: { label: "Rework or delay", hint: "Likely rework or delay if built as shown." },
  high: {
    label: "Life safety, code, or structure",
    hint: "Life safety, code compliance, or structural adequacy is involved.",
  },
};

export const SCOPE_LABEL: Record<PrecedenceScope, string> = {
  project_wide: "Whole project",
  division_scoped: "One division only",
  external: "In a referenced document",
  none_found: "No clause in the manual",
};

export const CONFLICT_CLASS_LABEL: Record<ConflictClass, string> = {
  E1: "Spec vs. drawing",
  E2: "Drawing vs. drawing",
  E3: "Spec vs. spec",
  E4: "In the specs, not on the drawings",
  E5: "On the drawings, not in the specs",
};

export const E1_SUBTYPE_LABEL: Record<E1Subtype, string> = {
  material_type: "Material",
  material_thickness: "Thickness or gauge",
  system_type: "System",
  frame_material: "Frame material",
  dimension_spacing: "Dimensions or spacing",
  grade_standard: "Grade or standard",
  performance_rating: "Performance rating",
  method_sequence: "Method or sequence",
  beneficial_exceedance: "One document asks for more than required",
};

/**
 * Shown when a project has no precedence provision record.
 *
 * An onboarding prompt, not an error: taxonomy v1.2 refuses to classify a
 * conflict without a record to cite, and the right response to that for a GC
 * is "here is what to add", not a failure.
 */
export const ONBOARDING_NO_PROVISION = {
  title: "Add your contract's order-of-precedence clause",
  body:
    "PocketPM uses it to tell you which document wins when the drawings and specs disagree. " +
    "It's usually in Division 01 or the General Conditions — paste it here. If you've searched " +
    "the whole manual and there isn't one, record that instead. That's an answer too.",
} as const;
