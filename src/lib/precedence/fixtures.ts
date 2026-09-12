/**
 * Fixtures transcribed from four real project manuals.
 *
 * The verbatim `source_text` is not decoration - traceability to the page is a
 * requirement, and these are also the record of what the classifier was
 * actually built against.
 */

import type { PrecedenceProvision } from "./types";

/**
 * WCU Quad Stair, p.89. An explicit ranked hierarchy.
 *
 * Note the sub-ranking WITHIN drawings. This is why rank entries name drawing
 * subtypes rather than a single "Drawings" category.
 */
export const WCU: PrecedenceProvision = {
  id: "wcu-1",
  project: "wcu",
  section: "Division 01",
  page: 89,
  scope: "project_wide",
  scope_target: null,
  rules: [
    {
      type: "RANK_SEQUENCE",
      order: [
        ["Form of Contract"],
        ["Specifications"],
        ["Large-scale detail drawings"],
        ["Small-scale drawings"],
      ],
    },
  ],
  // Settles E1 AND E2: it ranks specifications over drawings, and large-scale
  // detail drawings over small-scale ones. A boolean could not say this.
  resolves: ["E1", "E2"],
  external_instrument: null,
  source_text:
    "In case of discrepancy or disagreement in the contract documents, the order of precedence " +
    "shall be: Form of Contract, specifications, large-scale detail drawings, small-scale drawings.",
};

/**
 * UCCS General Conditions SC-6.23, p.66. Four tiers, the last one TIED.
 *
 * The ordering of `rules` is the whole point: Article 52 fires first, then
 * change orders, then the sequence - which ties on drawings versus
 * specifications - then stringency, then the Architect/Engineer.
 */
export const UCCS: PrecedenceProvision = {
  id: "uccs-1",
  project: "uccs",
  section: "SC-6.23",
  page: 66,
  scope: "project_wide",
  scope_target: null,
  rules: [
    { type: "OVERRIDE", applies_to: "Special Provisions", precedence: "ABSOLUTE", note: "Article 52" },
    { type: "OVERRIDE", applies_to: "Change Orders" },
    {
      type: "RANK_SEQUENCE",
      order: [
        ["Agreement"],
        ["Supplementary General Conditions"],
        ["General Conditions"],
        // TIED: this is what makes a drawing-vs-spec conflict fall through.
        ["Drawings", "Specifications"],
      ],
    },
    { type: "STRINGENCY", condition: "so long as reasonably inferable" },
    { type: "DISCRETION", authority: "Architect/Engineer" },
  ],
  // Looks as though it should, and does not: the tie is not a resolution.
  resolves: [],
  external_instrument: null,
  source_text:
    "...the more stringent or higher quality requirements shall apply so long as such more " +
    "stringent or higher quality requirements are reasonably inferable. The Architect/Engineer " +
    "shall decide which requirements will provide the best installation.",
};

/**
 * North Macon, Section 00 0100, p.16. Incorporated by reference, absent.
 *
 * 807 pages with no precedence language. The governing instrument is AIA A201
 * and it is not in the set. The correct output is neither a resolution nor an
 * absence - it names what to go and read.
 */
export const NORTH_MACON: PrecedenceProvision = {
  id: "north-macon-1",
  project: "north-macon",
  section: "00 0100",
  page: 16,
  scope: "external",
  scope_target: null,
  rules: [],
  resolves: [],
  external_instrument: { name: "AIA A201 Standard Agreement and General Conditions", edition: null },
  source_text:
    "The AIA, STANDARD AGREEMENT AND GENERAL CONDITIONS... are hereby made a part of these " +
    "Specifications... A copy of this document is on file at the office of the Architect.",
};

/**
 * Rees, Section 22 00 00 Plumbing, p.373. Division-scoped stringency.
 *
 * No project-level clause exists anywhere in the manual. This governs Division
 * 22 work and nothing else - a door schedule conflict is not covered by it,
 * which is the case the scope model exists to get right.
 */
export const REES: PrecedenceProvision = {
  id: "rees-1",
  project: "rees",
  section: "22 00 00",
  page: 373,
  scope: "division_scoped",
  scope_target: "22",
  rules: [
    { type: "STRINGENCY" },
    // The same section defers conditionally to Division 01. Observed in one
    // manual of four — see provenance.ts.
    { type: "DEFER", to: "Division 01", condition: "when available" },
  ],
  resolves: [],
  external_instrument: null,
  source_text:
    "In the event there is a discrepancy between the drawings, specifications, and current code, " +
    "the more stringent shall apply.",
};

/**
 * "Someone searched the whole manual and there is no precedence provision."
 *
 * NOT from one of the four manuals — this is the shape of an explicit negative
 * finding, which is a different thing from nobody having looked yet. Without a
 * record like this the two states are indistinguishable, and one is a finding
 * while the other is an absence of work.
 *
 * `source_text` here is the searcher's note rather than a clause, because there
 * is no clause to quote. It is still required: what was searched, and by whom,
 * is the evidence.
 */
export const SEARCHED_NONE_FOUND: PrecedenceProvision = {
  id: "searched-1",
  project: "example",
  section: "Full manual search",
  page: null,
  scope: "none_found",
  scope_target: null,
  rules: [],
  resolves: [],
  external_instrument: null,
  source_text:
    "Searched all 412 pages including Division 01, the General Conditions, and every technical " +
    "section, for precedence, shall govern, shall control, takes precedence, discrepancy, " +
    "inconsistency, more stringent, made a part of, and incorporated by reference. " +
    "No document-precedence provision found and none incorporated by reference.",
};

/**
 * Rees had no project-level precedence clause anywhere in the manual; its only
 * precedence language is the Division 22 rule.
 *
 * Under taxonomy v1.2 that fact is RECORDED rather than implied: without this
 * record a conflict outside Division 22 has no provision to cite, and the
 * classifier refuses rather than inventing "no provision".
 */
export const REES_NONE_FOUND: PrecedenceProvision = {
  id: "rees-none-found",
  project: "rees",
  section: "Full manual search",
  page: null,
  scope: "none_found",
  scope_target: null,
  rules: [],
  resolves: [],
  external_instrument: null,
  source_text:
    "Searched the complete project manual for a project-wide order-of-precedence clause. None " +
    "found; the only precedence language is Section 22 00 00 (Plumbing), which governs Division 22 " +
    "work only.",
};
