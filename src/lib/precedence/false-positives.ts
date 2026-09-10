/**
 * An advisory check on pasted text: does this look like something OTHER than a
 * document-precedence provision?
 *
 * ## Why this exists at all
 *
 * Keyword search for precedence language ran at roughly 45% precision across
 * four manuals. Choosing paste-and-confirm over automated extraction did not
 * remove that error — it moved it from a search to the person doing the
 * pasting, who is reading the same passages and can make the same mistake.
 *
 * ## What it is not
 *
 * NOT extraction. It reads text the user has already pasted; it opens no
 * document, sends nothing anywhere, and adds no dependency.
 *
 * NOT a gate. It warns. A conservative advisory that is sometimes wrong is
 * useful; a blocker that is sometimes wrong stops someone recording a real
 * provision, and the cost of that is a whole project coded as
 * "no_precedence_provision" when one exists.
 *
 * ## Precision over recall, deliberately
 *
 * Each pattern targets a specific documented false positive. A broad "does this
 * mention precedence" check would fire on every real provision too — the four
 * genuine ones all contain the trigger words — so `classify.test.ts` asserts
 * that none of them is flagged. That positive control is what stops this
 * becoming a checker that warns about everything and gets ignored.
 */

/**
 * What KIND of mistake this is, because the remedy differs.
 *
 * Five of the six documented false positives are passages about something other
 * than document precedence. The sixth genuinely IS about document precedence —
 * it just points at the provision instead of being it. Telling someone "this
 * may not be a precedence provision" when it plainly is would be wrong, and
 * would train them to dismiss the advisory.
 */
export type SignalKind =
  /** The passage is about something else entirely. */
  | "NOT_A_PROVISION"
  /** The passage refers to a provision located elsewhere. */
  | "POINTS_ELSEWHERE";

export interface FalsePositiveMatch {
  category: string;
  kind: SignalKind;
  /** What to tell the person who pasted it. */
  reason: string;
}

interface Pattern {
  category: string;
  kind: SignalKind;
  test: RegExp;
  reason: string;
}

/**
 * Documented in the taxonomy doc, Table 10. Each is a passage a keyword search
 * returned that is not a document-precedence provision.
 */
const PATTERNS: Pattern[] = [
  {
    category: "cpm-scheduling",
    kind: "NOT_A_PROVISION",
    test: /precedence\s+(format|diagram|network)|precedence\s+relationships?\b/i,
    reason:
      "This looks like CPM scheduling language. \u201cPrecedence\u201d there means activity " +
      "sequencing logic, not which document controls.",
  },
  {
    category: "stated-vs-scaled",
    kind: "NOT_A_PROVISION",
    test: /scaled?\s+dimensions?/i,
    reason:
      "This looks like the stated-versus-scaled dimension convention. It governs how to read a " +
      "drawing, not which document controls.",
  },
  {
    category: "manufacturer-requirements",
    kind: "NOT_A_PROVISION",
    test: /manufacturer(?:'|\u2019)?s?\s+(requirements?|instructions?|recommendations?|directions?)/i,
    reason:
      "This looks like contract-versus-manufacturer precedence. It ranks the Contract Documents " +
      "against a product\u2019s own instructions, not one contract document against another.",
  },
  {
    category: "warranty-duration",
    kind: "NOT_A_PROVISION",
    test: /\b(warrant(y|ies)|guarantees?)\b/i,
    reason:
      "This looks like a warranty-duration rule. It governs which time period applies, not which " +
      "requirement controls.",
  },
  {
    category: "jurisdictional-stringency",
    kind: "NOT_A_PROVISION",
    test: /\b(authorit(y|ies)|jurisdictions?|authorities having jurisdiction)\b/i,
    reason:
      "This looks like jurisdictional stringency \u2014 contract against code. It ranks an outside " +
      "authority's requirements against the contract, not one contract document against another.",
  },
  {
    /**
     * The odd one out, and the reason `kind` exists.
     *
     * This passage IS about document precedence. The error is that it REFERS to
     * the provision rather than being it, so pasting it records a provision
     * with no rules — which classifies every conflict on the project as
     * requires_clarification while looking as though the work was done.
     *
     * The pattern keys on a REFERENCE following "order of precedence" ("noted
     * in", "set forth in"), which is exactly what distinguishes it from WCU's
     * genuine clause: "the order of precedence shall be: Form of Contract,
     * specifications, ...". A pattern matching "order of precedence" alone
     * would flag the real provision too.
     */
    category: "cross-reference",
    kind: "POINTS_ELSEWHERE",
    test: /order of precedence\s+(?:as\s+)?(?:noted|set forth|described|stated|specified|referenced|established|defined)\s+in\b/i,
    reason:
      "This references a precedence provision located elsewhere rather than stating one. Find the " +
      "provision it points at and paste that instead \u2014 recording this would store a provision " +
      "with no rules in it.",
  },
];

/**
 * Returns every pattern the text matches, or an empty array.
 *
 * Every match rather than the first: a passage can look like two things at
 * once, and showing one reason would imply the others had been ruled out.
 */
export function falsePositiveSignals(text: string): FalsePositiveMatch[] {
  const value = text ?? "";
  return PATTERNS.filter((p) => p.test.test(value)).map(({ category, kind, reason }) => ({
    category,
    kind,
    reason,
  }));
}

/** Categories this can recognise, for tests and for the docs. */
export function knownFalsePositiveCategories(): string[] {
  return PATTERNS.map((p) => p.category);
}
