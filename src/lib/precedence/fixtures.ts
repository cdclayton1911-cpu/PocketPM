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
  scope: "PROJECT_WIDE",
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
  resolves_drawing_vs_spec: true,
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
  scope: "PROJECT_WIDE",
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
  resolves_drawing_vs_spec: false,
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
  scope: "EXTERNAL",
  scope_target: null,
  rules: [],
  resolves_drawing_vs_spec: false,
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
  scope: "DIVISION_SCOPED",
  scope_target: "22",
  rules: [{ type: "STRINGENCY" }],
  resolves_drawing_vs_spec: false,
  external_instrument: null,
  source_text:
    "In the event there is a discrepancy between the drawings, specifications, and current code, " +
    "the more stringent shall apply.",
};
