/**
 * Passages that a keyword search surfaces and that are NOT document-precedence
 * provisions. Verbatim from the taxonomy doc, Table 10.
 *
 * Keyword search on "precedence" and "shall govern" ran at roughly 45%
 * precision across four manuals. Choosing paste-and-confirm did not remove that
 * error, it moved it to the person pasting — so these are the cases
 * `false-positives.ts` warns about, and the ones its patterns are tuned against.
 *
 * INCOMPLETE: the message supplying these truncated partway through item 5, and
 * a sixth entry was named but never arrived. Table 10 may hold further rows not
 * transcribed here. Recorded so the gap is visible rather than assumed closed.
 */

export interface NegativeFixture {
  id: string;
  category: string;
  /** Verbatim passage. */
  text: string;
  /** Why it is not a document-precedence provision. */
  whyNot: string;
}

export const NEGATIVE_FIXTURES: NegativeFixture[] = [
  {
    id: "cpm-scheduling",
    category: "CPM scheduling terminology",
    text: "time-scaled precedence format",
    whyNot: "Refers to activity sequencing logic, not document hierarchy.",
  },
  {
    id: "stated-vs-scaled",
    category: "Stated-versus-scaled dimension convention",
    text: "Stated dimensions on the drawings shall take precedence over scaled dimensions",
    whyNot: "Governs how to read a drawing, not which document controls.",
  },
  {
    id: "manufacturer-requirements",
    category: "Manufacturer requirement precedence",
    text:
      "Where requirements indicated in Contract Documents exceed manufacturer's requirements, " +
      "Contract Documents shall govern",
    whyNot: "Contract-versus-manufacturer, not document-versus-document.",
  },
  {
    id: "warranty-duration",
    category: "Warranty duration precedence",
    text:
      "Whenever guarantees or warranties are required for a longer period than one year, such " +
      "longer period shall govern",
    whyNot: "Governs a time period, not a requirement conflict.",
  },
  {
    id: "jurisdictional-stringency",
    category: "Jurisdictional stringency",
    text:
      "Should the requirements of local, regional or state authorities exceed... the more " +
      "stringent shall govern",
    whyNot:
      "Ranks an outside authority's requirements against the contract, not one contract document " +
      "against another. (Rationale not supplied — the source message truncated here.)",
  },
];
