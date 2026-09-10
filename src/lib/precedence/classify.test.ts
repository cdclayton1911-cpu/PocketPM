import { describe, expect, it } from "vitest";

import { classifyConflict, divisionOf, provisionReaches } from "./classify";
import { NORTH_MACON, REES, UCCS, WCU } from "./fixtures";
import { NEGATIVE_FIXTURES, pendingNegativeFixtures } from "./negative-fixtures";
import type { DetectedConflict } from "./types";

const spec = (over = {}) => ({ documentType: "Specifications", ...over });
const drawing = (over = {}) => ({ documentType: "Drawings", ...over });

const conflict = (a: object, b: object): DetectedConflict =>
  ({ between: [a, b] }) as DetectedConflict;

describe("WCU - an explicit ranked hierarchy", () => {
  it("resolves a specification-versus-drawing conflict in favour of the specification", () => {
    const result = classifyConflict(conflict(spec(), { documentType: "Small-scale drawings" }), [WCU]);
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    expect(result.governing?.documentType).toBe("Specifications");
    expect(result.scope).toBe("PROJECT_WIDE");
    expect(result.provisionId).toBe("wcu-1");
  });

  it("resolves a detail sheet against a plan sheet using the drawing sub-ranking", () => {
    // The case a "drawings versus specifications" model cannot express: both
    // sides are drawings, and the clause still ranks them.
    const result = classifyConflict(
      conflict(
        { documentType: "Large-scale detail drawings", reference: "A-501" },
        { documentType: "Small-scale drawings", reference: "A-101" },
      ),
      [WCU],
    );
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    expect(result.governing?.reference).toBe("A-501");
  });

  it("explains which document won and why", () => {
    const result = classifyConflict(conflict(spec(), { documentType: "Small-scale drawings" }), [WCU]);
    expect(result.explanation).toMatch(/ranks Specifications above Small-scale drawings/);
  });

  it("does not rank a locus the sequence never names", () => {
    // "Shop drawings" is not in WCU's list. Ranking it anyway would invent a
    // hierarchy the contract does not state.
    const result = classifyConflict(
      conflict({ documentType: "Shop drawings" }, { documentType: "Product data" }),
      [WCU],
    );
    expect(result.class).toBe("REQUIRES_CLARIFICATION");
  });
});

describe("UCCS - a tied tier falling through to judgment", () => {
  it("cannot resolve drawings versus specifications, because they share a tier", () => {
    const result = classifyConflict(conflict(spec(), drawing()), [UCCS]);
    expect(result.class).toBe("PRECEDENCE_AMBIGUOUS");
    expect(result.governing).toBeNull();
  });

  it("explains that the stringency comparison is the reason", () => {
    const result = classifyConflict(conflict(spec(), drawing()), [UCCS]);
    expect(result.explanation).toMatch(/more stringent or higher quality/);
    expect(result.explanation).toMatch(/does not make for you/);
  });

  it("still resolves a conflict the sequence does rank", () => {
    // The positive control for the tie: the sequence is not broken, it simply
    // does not discriminate within its last tier.
    const result = classifyConflict(
      conflict({ documentType: "Agreement" }, { documentType: "General Conditions" }),
      [UCCS],
    );
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    expect(result.governing?.documentType).toBe("Agreement");
  });

  it("fires the Special Provisions override before the sequence", () => {
    const result = classifyConflict(
      conflict({ documentType: "Special Provisions" }, { documentType: "Agreement" }),
      [UCCS],
    );
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    // Agreement is FIRST in the rank sequence. Only an override applied before
    // the sequence produces this answer.
    expect(result.governing?.documentType).toBe("Special Provisions");
    expect(result.explanation).toMatch(/notwithstanding the order of precedence/);
  });

  it("fires the change-order override over an original document", () => {
    const result = classifyConflict(
      conflict({ documentType: "Change Orders" }, { documentType: "Specifications" }),
      [UCCS],
    );
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    expect(result.governing?.documentType).toBe("Change Orders");
  });

  it("records that it does not settle drawing-versus-spec, despite looking as though it should", () => {
    expect(UCCS.resolves_drawing_vs_spec).toBe(false);
  });
});

describe("North Macon - incorporated by reference and absent", () => {
  it("names the external instrument rather than resolving or reporting nothing", () => {
    const result = classifyConflict(conflict(spec(), drawing()), [NORTH_MACON]);
    expect(result.class).toBe("PRECEDENCE_INCORPORATED");
    expect(result.scope).toBe("EXTERNAL");
    expect(result.externalInstrument?.name).toMatch(/A201/);
  });

  it("says the governing provision is not in the set", () => {
    const result = classifyConflict(conflict(spec(), drawing()), [NORTH_MACON]);
    expect(result.explanation).toMatch(/not in this document set/);
  });
});

describe("Rees - a division-scoped rule", () => {
  it("classifies a Division 22 conflict as ambiguous via the section rule", () => {
    const result = classifyConflict(
      conflict(spec({ section: "22 00 00", division: "22" }), drawing({ reference: "P-101" })),
      [REES],
    );
    expect(result.class).toBe("PRECEDENCE_AMBIGUOUS");
    expect(result.scope).toBe("DIVISION_SCOPED");
    expect(result.provisionId).toBe("rees-1");
  });

  it("does NOT reach a Division 08 door schedule conflict", () => {
    // The plumbing rule governs plumbing work. Applying it here would be a
    // confidently wrong classification of the most damaging kind.
    const result = classifyConflict(
      conflict(spec({ section: "08 71 00", division: "08" }), drawing({ reference: "A-601" })),
      [REES],
    );
    expect(result.class).toBe("NO_PRECEDENCE_PROVISION");
    expect(result.scope).toBe("NONE_FOUND");
  });

  it("says a provision exists but governs elsewhere, rather than implying none was found", () => {
    const result = classifyConflict(
      conflict(spec({ division: "08" }), drawing()),
      [REES],
    );
    expect(result.explanation).toMatch(/govern only 22/);
  });

  it("derives the division from a section number when none is given", () => {
    expect(divisionOf({ documentType: "Specifications", section: "22 00 00" })).toBe("22");
    expect(divisionOf({ documentType: "Drawings" })).toBeNull();
  });
});

describe("choosing between provisions", () => {
  it("prefers the division-scoped rule over a project-wide one", () => {
    // Most specific applicable rule governs, so resolution depends on where in
    // the document set the conflict sits.
    const result = classifyConflict(
      conflict(spec({ division: "22" }), drawing()),
      [WCU, { ...REES, project: "wcu" }],
    );
    expect(result.provisionId).toBe("rees-1");
    expect(result.class).toBe("PRECEDENCE_AMBIGUOUS");
  });

  it("falls back to the project-wide rule outside the scoped division", () => {
    const result = classifyConflict(
      conflict(spec({ division: "08" }), { documentType: "Small-scale drawings" }),
      [WCU, { ...REES, project: "wcu" }],
    );
    expect(result.provisionId).toBe("wcu-1");
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
  });

  it("reports no provision when the project has none recorded", () => {
    const result = classifyConflict(conflict(spec(), drawing()), []);
    expect(result.class).toBe("NO_PRECEDENCE_PROVISION");
    expect(result.explanation).toMatch(/none is incorporated by reference/);
  });

  /**
   * Documented so it reads as intended rather than as something to tighten.
   *
   * A DIVISION_SCOPED provision reaches a conflict when EITHER side sits in the
   * division - not both. This is deliberate: drawings usually carry no division
   * of their own, so requiring both would make a plumbing clause fail to reach
   * a plumbing specification against the drawing that shows the plumbing.
   *
   * The cost is that a conflict spanning two divisions can be reached by a rule
   * scoped to only one of them. That is the correct reading of a clause saying
   * "in the event there is a discrepancy between the drawings, specifications,
   * and current code" INSIDE Section 22 00 00 - it is about Division 22 work,
   * whatever the other side of the conflict happens to be.
   */
  it("reaches a conflict when EITHER locus is in the division, not only both", () => {
    const specSide = classifyConflict(
      conflict(spec({ division: "22" }), drawing()),
      [REES],
    );
    expect(specSide.provisionId).toBe("rees-1");

    // Same conflict, sides swapped: the division may be on either one.
    const drawingSide = classifyConflict(
      conflict(drawing(), spec({ division: "22" })),
      [REES],
    );
    expect(drawingSide.provisionId).toBe("rees-1");

    // And a locus carrying only the full section number counts too.
    const bySection = classifyConflict(
      conflict(spec({ section: "22 00 00" }), drawing()),
      [REES],
    );
    expect(bySection.provisionId).toBe("rees-1");
  });

  it("is NOT reached when neither locus is in the division", () => {
    // The other half of the asymmetry, and the Rees Division 08 case.
    expect(
      provisionReaches(REES, conflict(spec({ division: "08" }), drawing({ division: "09" }))),
    ).toBe(false);
  });

  it("knows a division-scoped provision does not reach an unrelated conflict", () => {
    expect(provisionReaches(REES, conflict(spec({ division: "08" }), drawing()))).toBe(false);
    expect(provisionReaches(REES, conflict(spec({ division: "22" }), drawing()))).toBe(true);
  });
});

/**
 * Roughly half of keyword hits are noise. These fail by name until the verbatim
 * passages are transcribed, rather than being skipped - a pending test that
 * reports nothing is how a fixture quietly stays unwritten.
 *
 * Inventing plausible text would be worse than either: it would test the
 * classifier against a fiction instead of the passages that actually fooled the
 * search.
 */
describe("false positives from keyword search", () => {
  it.each(NEGATIVE_FIXTURES.map((f) => [f.id, f] as const))(
    "%s - verbatim passage supplied",
    (_id, fixture) => {
      expect(
        fixture.text,
        `No verbatim text yet for "${fixture.category}" (${fixture.whyItMatched}). ` +
          `Transcribe it from the manual into negative-fixtures.ts and add the assertion ` +
          `that it is NOT classified as a document-precedence provision.`,
      ).not.toBeNull();
    },
  );

  it("reports how many are still outstanding", () => {
    const pending = pendingNegativeFixtures();
    expect(
      pending.length,
      `${pending.length} negative fixture(s) awaiting verbatim text: ${pending.map((f) => f.id).join(", ")}`,
    ).toBe(0);
  });
});
