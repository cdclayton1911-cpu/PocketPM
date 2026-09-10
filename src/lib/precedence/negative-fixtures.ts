/**
 * Passages that a keyword search surfaces and that are NOT document-precedence
 * provisions. Verbatim from the taxonomy doc, Table 10.
 *
 * Keyword search on "precedence" and "shall govern" ran at roughly 45%
 * precision across four manuals. Choosing paste-and-confirm did not remove that
 * error, it moved it to the person pasting — so these are the cases
 * `false-positives.ts` warns about, and the ones its patterns are tuned against.
 *
 * Table 10 is FULLY TRANSCRIBED: six rows, all present.
 *
 * Five are passages about something other than document precedence. The sixth
 * is about document precedence and merely points at it, which needs a different
 * warning and a different remedy — see SignalKind in false-positives.ts.
 */

export interface NegativeFixture {
  id: string;
  category: string;
  /** Verbatim passage. */
  text: string;
  /** Why it is not a usable document-precedence provision. */
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
    whyNot: "Contract-versus-code, not document-versus-document.",
  },
  {
    id: "cross-reference",
    category: "Cross-reference to a provision elsewhere",
    text: "...giving due consideration to the order of precedence noted in Article 2C",
    whyNot:
      "Points at the provision; is not itself the provision. Recording it would store a provision " +
      "with no rules, which classifies every conflict as requires_clarification while looking as " +
      "though the work was done.",
  },
];
