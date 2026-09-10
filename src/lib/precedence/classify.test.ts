import { describe, expect, it } from "vitest";

import { classifyConflict, divisionOf, provisionReaches } from "./classify";
import { NORTH_MACON, REES, SEARCHED_NONE_FOUND, UCCS, WCU } from "./fixtures";
import { RULE_PROVENANCE, provisionalRuleTypes } from "./provenance";
import { falsePositiveSignals, knownFalsePositiveCategories } from "./false-positives";
import { NEGATIVE_FIXTURES } from "./negative-fixtures";
import type { ConflictClass, DetectedConflict } from "./types";

const spec = (over = {}) => ({ documentType: "Specifications", ...over });
const drawing = (over = {}) => ({ documentType: "Drawings", ...over });

/** Every conflict carries its class: it is decided first, and required here. */
const conflict = (a: object, b: object, cls: ConflictClass = "E1"): DetectedConflict =>
  ({ conflict_class: cls, between: [a, b] }) as DetectedConflict;

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

  it("claims to settle nothing, despite looking as though it should settle E1", () => {
    expect(UCCS.resolves).toEqual([]);
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
    // Says nobody has looked, rather than implying a search came back empty.
    expect(result.explanation).toMatch(/nobody has looked/i);
    expect(result.searchState).toBe("NOT_SEARCHED");
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
 * The documented false positives, asserted rather than described.
 *
 * Roughly half of keyword hits across the four manuals were noise. The choice
 * of paste-and-confirm over extraction did not remove that error — it moved it
 * to the person pasting, who is reading the same passages.
 *
 * The positive control is the half that matters: a checker that flagged
 * everything would pass every negative case here and be worthless, so the four
 * real provisions are asserted NOT to be flagged.
 */
describe("false positives from keyword search", () => {
  it.each(NEGATIVE_FIXTURES.map((f) => [f.id, f] as const))(
    "%s is recognised as not a precedence provision",
    (id, fixture) => {
      const signals = falsePositiveSignals(fixture.text);
      expect(
        signals.map((s) => s.category),
        `"${fixture.text}" should be flagged as ${id}. ${fixture.whyNot}`,
      ).toContain(id);
    },
  );

  it.each([
    ["WCU", WCU],
    ["UCCS", UCCS],
    ["North Macon", NORTH_MACON],
    ["Rees", REES],
  ] as const)("%s, a REAL provision, is not flagged", (_name, provision) => {
    // Without this the checker could match on "precedence" or "shall govern"
    // and warn about every genuine clause, which is how an advisory gets
    // ignored — and then it is worse than absent.
    expect(falsePositiveSignals(provision.source_text)).toEqual([]);
  });

  it("covers every documented category", () => {
    // A fixture added without a matching pattern would silently never be
    // checked; a pattern with no fixture would never be exercised.
    expect(knownFalsePositiveCategories().sort()).toEqual(
      NEGATIVE_FIXTURES.map((f) => f.id).sort(),
    );
  });

  /**
   * The sixth row is not like the other five.
   *
   * "...the order of precedence noted in Article 2C" IS about document
   * precedence — telling someone it might not be would be wrong, and would
   * teach them to dismiss the advisory. The error is that it points at the
   * provision instead of being it.
   */
  it("tells a cross-reference apart from a passage about something else", () => {
    const pointer = falsePositiveSignals(
      "...giving due consideration to the order of precedence noted in Article 2C",
    );
    expect(pointer.map((s) => s.kind)).toEqual(["POINTS_ELSEWHERE"]);
    expect(pointer[0].reason).toMatch(/paste that instead/i);
    // And it must NOT say "this may not be a precedence provision" — it is one.
    expect(pointer[0].reason).not.toMatch(/looks like/i);
  });

  it("does not flag a real clause that states its own order of precedence", () => {
    // WCU contains the words "order of precedence" and is the genuine article.
    // A pattern keyed on that phrase alone would flag it; this one keys on a
    // REFERENCE following it ("noted in", "set forth in").
    expect(falsePositiveSignals(WCU.source_text)).toEqual([]);
    expect(
      falsePositiveSignals("In case of discrepancy, the order of precedence shall be: Form of Contract, specifications"),
    ).toEqual([]);
  });

  it("gives the other five a different kind, and so a different remedy", () => {
    for (const fixture of NEGATIVE_FIXTURES.filter((f) => f.id !== "cross-reference")) {
      const signals = falsePositiveSignals(fixture.text);
      expect(signals.some((s) => s.kind === "NOT_A_PROVISION")).toBe(true);
    }
  });

  it("reports every signal, not just the first", () => {
    // A passage can look like two things at once. Showing one reason would
    // imply the others had been ruled out.
    const both = "Manufacturer's requirements for warranties shall govern";
    expect(falsePositiveSignals(both).length).toBeGreaterThan(1);
  });
});

describe("the resolves claim is verified, not trusted", () => {
  /** An exemplar conflict for each class a fixture claims to settle. */
  const EXEMPLARS: Record<string, Record<string, DetectedConflict>> = {
    "wcu-1": {
      E1: conflict(spec(), { documentType: "Small-scale drawings" }, "E1"),
      E2: conflict(
        { documentType: "Large-scale detail drawings" },
        { documentType: "Small-scale drawings" },
        "E2",
      ),
    },
  };

  const claiming = [WCU, UCCS, NORTH_MACON, REES].filter((p) => p.resolves.length > 0);

  it("every provision claiming a class has an exemplar to prove it", () => {
    // Without this, a claim could be added and never exercised — the same
    // unverifiable assertion the boolean was, in a new shape.
    for (const provision of claiming) {
      for (const cls of provision.resolves) {
        expect(
          EXEMPLARS[provision.id]?.[cls],
          `${provision.id} claims to resolve ${cls} but no exemplar conflict exists to check it`,
        ).toBeDefined();
      }
    }
  });

  it("and the classifier actually returns resolvable for it", () => {
    for (const provision of claiming) {
      for (const cls of provision.resolves) {
        const exemplar = EXEMPLARS[provision.id][cls];
        const result = classifyConflict(exemplar, [provision]);
        expect(
          result.class,
          `${provision.id} claims to resolve ${cls}, but classifying its exemplar gave ${result.class}`,
        ).toBe("PRECEDENCE_RESOLVABLE");
      }
    }
  });

  it("a provision claiming nothing does not resolve the common conflict", () => {
    // The negative half: UCCS claims [] and must not resolve E1.
    expect(classifyConflict(conflict(spec(), drawing(), "E1"), [UCCS]).class).toBe(
      "PRECEDENCE_AMBIGUOUS",
    );
  });
});

describe("DEFER", () => {
  const div22 = () => conflict(spec({ division: "22" }), drawing(), "E1");
  /** Rees, with the stringency rule removed so DEFER is reached. */
  const deferOnly = { ...REES, rules: REES.rules.filter((r) => r.type === "DEFER") };

  it("does not fall through silently — it names what it defers to", () => {
    const result = classifyConflict(div22(), [deferOnly]);
    expect(result.class).toBe("REQUIRES_CLARIFICATION");
    expect(result.explanation).toMatch(/Division 01/);
  });

  it("says so plainly when the deferred-to document is absent", () => {
    const result = classifyConflict(div22(), [deferOnly], { availableDocuments: ["Division 22"] });
    expect(result.explanation).toMatch(/NOT in this document set/);
  });

  it("points at it when present", () => {
    const result = classifyConflict(div22(), [deferOnly], {
      availableDocuments: ["Division 01", "Division 22"],
    });
    expect(result.explanation).toMatch(/is in this document set/);
  });

  it("admits it cannot tell when availability is unknown", () => {
    // Whether a document is available is a fact about the SET, not the clause.
    const result = classifyConflict(div22(), [deferOnly]);
    expect(result.explanation).toMatch(/cannot determine/);
  });

  it("is reached only after the rules above it", () => {
    // Rees carries STRINGENCY first, so the real fixture is ambiguous, not a
    // clarification. Rule order is the whole model.
    expect(classifyConflict(div22(), [REES]).class).toBe("PRECEDENCE_AMBIGUOUS");
  });
});

describe("searched-none-found is not the same as nobody looked", () => {
  it("reports NOT_SEARCHED when the project has no records", () => {
    const result = classifyConflict(conflict(spec(), drawing()), []);
    expect(result.class).toBe("NO_PRECEDENCE_PROVISION");
    expect(result.searchState).toBe("NOT_SEARCHED");
    expect(result.explanation).toMatch(/nobody has looked/i);
  });

  it("reports SEARCHED_NONE_FOUND when someone recorded a full-manual search", () => {
    const result = classifyConflict(conflict(spec(), drawing()), [SEARCHED_NONE_FOUND]);
    expect(result.class).toBe("NO_PRECEDENCE_PROVISION");
    expect(result.searchState).toBe("SEARCHED_NONE_FOUND");
    expect(result.provisionId).toBe("searched-1");
  });

  it("keeps the precedence class identical while the finding differs", () => {
    // Both are NO_PRECEDENCE_PROVISION — that is the spec's enum and it stays
    // intact. The difference lives beside it, where it can be seen.
    const nobody = classifyConflict(conflict(spec(), drawing()), []);
    const searched = classifyConflict(conflict(spec(), drawing()), [SEARCHED_NONE_FOUND]);
    expect(nobody.class).toBe(searched.class);
    expect(nobody.searchState).not.toBe(searched.searchState);
  });

  it("a NONE_FOUND record still carries evidence of what was searched", () => {
    expect(SEARCHED_NONE_FOUND.source_text).toMatch(/Searched all/);
  });
});

describe("provisional constructs", () => {
  it("flags an outcome decided by a single-observation construct", () => {
    // UCCS Article 52 is an OVERRIDE, seen in one manual of four.
    const result = classifyConflict(
      conflict({ documentType: "Special Provisions" }, { documentType: "Agreement" }),
      [UCCS],
    );
    expect(result.class).toBe("PRECEDENCE_RESOLVABLE");
    expect(result.provisional).toBe(true);
    expect(result.provisionalReason).toMatch(/1 of 4/);
  });

  it("does not flag one decided by an established construct", () => {
    const result = classifyConflict(conflict(spec(), { documentType: "Small-scale drawings" }), [WCU]);
    expect(result.provisional).toBe(false);
    expect(result.provisionalReason).toBeNull();
  });

  it("records provenance for every rule type, so a new one cannot skip it", () => {
    const types = ["OVERRIDE", "RANK_SEQUENCE", "STRINGENCY", "DISCRETION", "DEFER"] as const;
    for (const t of types) expect(RULE_PROVENANCE[t]).toBeDefined();
  });

  it("marks OVERRIDE provisional too, not only DEFER", () => {
    // Both rest on one manual. Flagging DEFER and not OVERRIDE would apply the
    // rule inconsistently to identical evidence.
    expect(provisionalRuleTypes().sort()).toEqual(["DEFER", "DISCRETION", "OVERRIDE"]);
  });
});
