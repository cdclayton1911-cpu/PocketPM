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

export interface FalsePositiveMatch {
  category: string;
  /** What to tell the person who pasted it. */
  reason: string;
}

interface Pattern {
  category: string;
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
    test: /precedence\s+(format|diagram|network)|precedence\s+relationships?\b/i,
    reason:
      "This looks like CPM scheduling language. \u201cPrecedence\u201d there means activity " +
      "sequencing logic, not which document controls.",
  },
  {
    category: "stated-vs-scaled",
    test: /scaled?\s+dimensions?/i,
    reason:
      "This looks like the stated-versus-scaled dimension convention. It governs how to read a " +
      "drawing, not which document controls.",
  },
  {
    category: "manufacturer-requirements",
    test: /manufacturer(?:'|\u2019)?s?\s+(requirements?|instructions?|recommendations?|directions?)/i,
    reason:
      "This looks like contract-versus-manufacturer precedence. It ranks the Contract Documents " +
      "against a product\u2019s own instructions, not one contract document against another.",
  },
  {
    category: "warranty-duration",
    test: /\b(warrant(y|ies)|guarantees?)\b/i,
    reason:
      "This looks like a warranty-duration rule. It governs which time period applies, not which " +
      "requirement controls.",
  },
  {
    category: "jurisdictional-stringency",
    test: /\b(authorit(y|ies)|jurisdictions?|authorities having jurisdiction)\b/i,
    reason:
      "This looks like jurisdictional stringency \u2014 code or authority requirements against the " +
      "contract. It is not a hierarchy among the contract documents.",
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
  return PATTERNS.filter((p) => p.test.test(value)).map(({ category, reason }) => ({
    category,
    reason,
  }));
}

/** Categories this can recognise, for tests and for the docs. */
export function knownFalsePositiveCategories(): string[] {
  return PATTERNS.map((p) => p.category);
}
