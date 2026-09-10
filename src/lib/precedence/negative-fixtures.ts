/**
 * Passages that a keyword search surfaces and that are NOT document-precedence
 * provisions.
 *
 * Keyword search on "precedence" and "shall govern" ran at roughly 45%
 * precision across these four manuals. These are the categories of noise it
 * returned. A system that reads CPM "precedence format" as a document hierarchy
 * will produce confidently wrong classifications, so the negative cases matter
 * as much as the positive ones.
 *
 * `text: null` means THE VERBATIM PASSAGE HAS NOT BEEN SUPPLIED YET. The test
 * suite fails on each one by name rather than skipping it - invented text would
 * test the classifier against a plausible fiction instead of the thing that
 * actually fooled the search.
 */

export interface NegativeFixture {
  id: string;
  /** What kind of false positive this is. */
  category: string;
  /** Where it came from, once supplied. */
  source: string;
  /** Verbatim passage. Null until transcribed from the manual. */
  text: string | null;
  /** Why a keyword search picked it up. */
  whyItMatched: string;
}

export const NEGATIVE_FIXTURES: NegativeFixture[] = [
  {
    id: "cpm-scheduling",
    category: "CPM scheduling terminology",
    source: "TODO: manual and page",
    text: null,
    whyItMatched: '"precedence" as in precedence diagramming / activity relationships, not documents.',
  },
  {
    id: "stated-vs-scaled",
    category: "Stated-versus-scaled dimension convention",
    source: "TODO: manual and page",
    text: null,
    whyItMatched: '"shall govern" applied to figured dimensions over scaled ones - a measurement rule, not a document hierarchy.',
  },
  {
    id: "manufacturer-requirements",
    category: "Manufacturer requirement precedence",
    source: "TODO: manual and page",
    text: null,
    whyItMatched: '"take precedence" applied to manufacturer instructions over the specification for a single product.',
  },
  {
    id: "warranty-duration",
    category: "Warranty duration precedence",
    source: "TODO: manual and page",
    text: null,
    whyItMatched: '"shall govern" applied to the longer of two warranty periods.',
  },
];

/** The ones still waiting on verbatim text. */
export function pendingNegativeFixtures(): NegativeFixture[] {
  return NEGATIVE_FIXTURES.filter((f) => f.text === null);
}
