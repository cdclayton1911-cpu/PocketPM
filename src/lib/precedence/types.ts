/**
 * Precedence taxonomy: the shapes a real project manual's precedence
 * arrangement can take.
 *
 * Derived from four complete project manuals (3,350 pages), which produced four
 * STRUCTURALLY DIFFERENT arrangements. The design follows from those, and each
 * decision below exists because one of them would otherwise be unrepresentable:
 *
 *  - WCU Quad Stair, p.89 - an explicit ranked hierarchy that sub-ranks WITHIN
 *    drawings (large-scale detail over small-scale). A model that knows only
 *    "drawings vs specifications" cannot apply it.
 *  - UCCS SC-6.23, p.66 - a four-tier sequence whose LAST TIER IS TIED
 *    (drawings and specifications together), so the sequence does not resolve
 *    the most common conflict at all and falls through to a stringency test and
 *    then to the design professional. Plus two overrides that fire first.
 *  - North Macon 00 0100, p.16 - no precedence language in 807 pages; the
 *    governing instrument is AIA A201, incorporated by reference and NOT IN THE
 *    DOCUMENT SET.
 *  - Rees 22 00 00, p.373 - a stringency rule inside a technical section, which
 *    governs Division 22 work only. A door schedule conflict is not covered.
 *
 * The two enums are INDEPENDENT. A provision's scope says where it applies; its
 * class says what it can do about a conflict once it applies. Collapsing them
 * loses the Rees case, where a perfectly resolvable-shaped rule simply does not
 * reach the conflict in front of you.
 */

/**
 * What KIND of conflict this is, decided from the documents alone.
 *
 * Determined BEFORE precedence is assessed. That ordering is a coding-bias
 * control: knowing the contract resolves something pulls a coder toward
 * deciding no conflict existed. It is enforced structurally here — a
 * `DetectedConflict` cannot be built without a class, so precedence cannot be
 * classified for a conflict whose class was never decided.
 */
export type ConflictClass =
  /** Direct contradiction between a specification and a drawing. */
  | "E1"
  /** Drawing against drawing. */
  | "E2"
  /** Specification against specification. */
  | "E3"
  /** Specified but not shown. */
  | "E4"
  /** Shown but not specified. */
  | "E5";

export const CONFLICT_CLASSES: ConflictClass[] = ["E1", "E2", "E3", "E4", "E5"];

/** E1 sub-types. Only E1 is sub-typed. */
export type E1Subtype =
  | "material_type"
  | "material_thickness"
  | "system_type"
  | "frame_material"
  | "dimension_spacing"
  | "grade_standard"
  | "performance_rating"
  | "method_sequence"
  | "beneficial_exceedance";

export const E1_SUBTYPES: E1Subtype[] = [
  "material_type", "material_thickness", "system_type", "frame_material",
  "dimension_spacing", "grade_standard", "performance_rating", "method_sequence",
  "beneficial_exceedance",
];

/** What the applicable provision can do about this conflict. */
export type PrecedenceClass =
  /** A provision exists and deterministically settles which requirement governs. */
  | "PRECEDENCE_RESOLVABLE"
  /** A provision exists, but resolving needs a judgment it does not supply. */
  | "PRECEDENCE_AMBIGUOUS"
  /** Governed by an identified external instrument not present in the set. */
  | "PRECEDENCE_INCORPORATED"
  /** A provision applies here but does not address this conflict type. */
  | "REQUIRES_CLARIFICATION"
  /** No provision reaches this conflict, and none is incorporated. */
  | "NO_PRECEDENCE_PROVISION";

/** Where a provision applies. */
export type PrecedenceScope =
  | "PROJECT_WIDE"
  | "DIVISION_SCOPED"
  | "EXTERNAL"
  | "NONE_FOUND";

/**
 * A document type as named by a precedence clause.
 *
 * Free text rather than a closed union: manuals name their documents in their
 * own words ("Form of Contract", "Supplementary General Conditions"), and a
 * fixed list would silently fail to match the next manual. Matching is done by
 * `documentMatches` below, which normalises rather than requiring exact strings.
 */
export type DocumentType = string;

/**
 * A tier in a rank sequence. MORE THAN ONE ENTRY MEANS TIED.
 *
 * This is the whole reason the order is a list of lists. UCCS puts drawings and
 * specifications in one tier, which is what makes a drawing-vs-spec conflict
 * fall through to the stringency test. A flat rank list would report it
 * resolvable and pick a winner the contract does not name.
 */
export type RankTier = DocumentType[];

export type PrecedenceRule =
  /**
   * Fires before anything below it. `ABSOLUTE` marks an override the clause
   * says applies notwithstanding the sequence (UCCS Article 52).
   */
  | { type: "OVERRIDE"; applies_to: DocumentType; precedence?: "ABSOLUTE"; note?: string }
  | { type: "RANK_SEQUENCE"; order: RankTier[] }
  /** "the more stringent or higher quality requirement shall apply". */
  | { type: "STRINGENCY"; condition?: string }
  /** Reserved to a named person: a judgment the document does not make. */
  | { type: "DISCRETION"; authority: string }
  /**
   * Points at another document, conditionally.
   *
   * Rees 22 00 00 defers to Division 01 "when available". The condition is not
   * one the classifier can evaluate — whether a document is available is a fact
   * about the set, not about the clause — so this always ends in a
   * clarification that NAMES what it defers to, rather than falling silently
   * through to the next rule.
   */
  | { type: "DEFER"; to: string; condition?: string };

export interface PrecedenceProvision {
  id: string;
  project: string;
  /** Section identifier as printed, e.g. "SC-6.23" or "00 0100". */
  section: string;
  /** Page in the manual as supplied by the person recording it. */
  page: number | null;
  scope: PrecedenceScope;
  /**
   * Which division or section this governs, when DIVISION_SCOPED.
   * e.g. "22" or "22 00 00".
   */
  scope_target: string | null;
  /**
   * The decision procedure, IN ORDER. Not a rank list.
   *
   * A rank list cannot express UCCS: two overrides fire before the sequence,
   * and two further rules fire after it when the sequence ties.
   */
  rules: PrecedenceRule[];
  /**
   * Which conflict classes this provision can settle.
   *
   * Was a `resolves_drawing_vs_spec` boolean, which could not record WCU: it
   * sub-ranks drawings, so it settles E2 as well as E1. A provision that
   * settles one class and not another has no boolean representation.
   *
   * A set of CLASSES rather than document pairs — pairs would require every
   * named document type enumerated per provision, and manuals name their
   * documents in their own words.
   *
   * This is a claim, and it is CHECKABLE: classify.test.ts asserts that a
   * provision claiming a class actually classifies a conflict of that class as
   * resolvable. As a boolean it was an unverifiable assertion by whoever typed
   * it.
   */
  resolves: ConflictClass[];
  /** Named instrument and edition, when scope is EXTERNAL. */
  external_instrument: { name: string; edition: string | null } | null;
  /** The verbatim passage. Required: traceability to the page is the point. */
  source_text: string;
}

/** One side of a conflict. */
export interface ConflictLocus {
  /** As the manual would name it, e.g. "Specifications", "Small-scale drawings". */
  documentType: DocumentType;
  /** CSI division, e.g. "22". Used for scoping a DIVISION_SCOPED provision. */
  division?: string;
  /** Section identifier, e.g. "22 00 00". */
  section?: string;
  /** Sheet or page reference, carried through for traceability. */
  reference?: string;
}

/**
 * A detected conflict, as two loci.
 *
 * Deliberately NOT modelled as `{ specLocus, drawingLocus }`. WCU ranks
 * large-scale detail drawings above small-scale drawings, so a conflict between
 * a detail sheet and a plan sheet has no specification side at all - and that
 * is one of the cases this has to classify.
 */
export interface DetectedConflict {
  /**
   * Required, and required first. See ConflictClass: this is the coding-bias
   * control made structural rather than procedural.
   */
  conflict_class: ConflictClass;
  /** Only E1 is sub-typed. */
  conflict_subtype?: E1Subtype;
  between: [ConflictLocus, ConflictLocus];
  /** Optional description, echoed into the explanation. */
  description?: string;
}

/**
 * Whether anyone has looked.
 *
 * `no_precedence_provision` means the same thing in both of these cases and
 * they are opposite: one is a finding, the other is an absence of work. Kept
 * beside the class rather than folded into it, so the five classes stay as the
 * spec defines them while the difference stays observable.
 */
export type SearchState =
  /** A provision was found and applied. */
  | "PROVISION_APPLIED"
  /** Someone searched the manual and recorded that there is none. */
  | "SEARCHED_NONE_FOUND"
  /** Nobody has recorded anything for this project yet. */
  | "NOT_SEARCHED";

export interface PrecedenceClassification {
  class: PrecedenceClass;
  searchState: SearchState;
  /**
   * True when a construct observed in only ONE of the four manuals decided
   * this. Travels with the finding rather than living in a document nobody
   * re-reads. See provenance.ts.
   */
  provisional: boolean;
  /** Which construct was provisional, when one was. */
  provisionalReason: string | null;
  /** The scope of the provision actually applied; NONE_FOUND when none was. */
  scope: PrecedenceScope;
  /** Which provision decided this, by id. Null when none applied. */
  provisionId: string | null;
  /** The locus that governs, when the class is PRECEDENCE_RESOLVABLE. */
  governing: ConflictLocus | null;
  /** Why. A user needs to know why something is ambiguous, not just that it is. */
  explanation: string;
  /** The instrument to consult, when PRECEDENCE_INCORPORATED. */
  externalInstrument: { name: string; edition: string | null } | null;
}

/** Lower-case, collapse whitespace and punctuation, for tolerant comparison. */
export function normalizeDocumentType(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Drawing subtypes, so a clause naming "drawings" generically still covers a
 * locus that names a specific kind - and so WCU's sub-ranking can distinguish
 * them when the clause DOES name them.
 */
const DRAWING_WORDS = ["drawing", "drawings", "sheet", "plan", "detail", "schedule"];

function isDrawingish(normalized: string): boolean {
  return DRAWING_WORDS.some((w) => normalized.includes(w));
}

/**
 * Does a rank entry cover this locus?
 *
 * Exact match first. Failing that, a GENERIC drawings entry covers any drawing
 * subtype - but a SPECIFIC entry ("large scale detail drawings") does not cover
 * a different specific subtype, which is what keeps WCU's sub-ranking honest.
 */
export function documentMatches(tierEntry: DocumentType, locusType: DocumentType): boolean {
  const entry = normalizeDocumentType(tierEntry);
  const locus = normalizeDocumentType(locusType);
  if (entry === locus) return true;
  if (entry === "drawings" || entry === "drawing") return isDrawingish(locus);
  // A locus naming only "drawings" is not enough to place it in a specific
  // drawing tier; that is a genuine ambiguity, not a match.
  return false;
}
