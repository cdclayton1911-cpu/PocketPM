import { describe, expect, it } from "vitest";

import { classifyConflict, divisionOf, NoProvisionRecordError, provisionReaches } from "./classify";
import { falsePositiveSignals, knownFalsePositiveCategories } from "./false-positives";
import { NORTH_MACON, REES, REES_NONE_FOUND, SEARCHED_NONE_FOUND, UCCS, WCU } from "./fixtures";
import { NEGATIVE_FIXTURES } from "./negative-fixtures";
import { provisionalRuleTypes, RULE_PROVENANCE } from "./provenance";
import type { ConflictClass, ConflictLocus, DetectedConflict, PrecedenceClassification } from "./types";

const spec = (over: Partial<ConflictLocus> = {}): ConflictLocus => ({ document: "Specifications", ...over });
const drawing = (over: Partial<ConflictLocus> = {}): ConflictLocus => ({ document: "Drawings", ...over });

/** Conflict class is decided first, and required. */
const conflict = (a: ConflictLocus, b: ConflictLocus, cls: ConflictClass = "E1"): DetectedConflict => ({
  conflict_class: cls,
  between: [a, b],
});

/** The locus a classification says governs, or null. */
const governing = (c: DetectedConflict, r: PrecedenceClassification) =>
  r.governingIndex === null ? null : c.between[r.governingIndex];

describe("WCU — an explicit ranked hierarchy", () => {
  it("resolves a specification-versus-drawing conflict in favour of the specification", () => {
    const c = conflict(spec(), { document: "Small-scale drawings" });
    const r = classifyConflict(c, [WCU]);
    expect(r.class).toBe("precedence_resolvable");
    expect(governing(c, r)?.document).toBe("Specifications");
    expect(r.governingIndex).toBe(0);
    expect(r.scope).toBe("project_wide");
    expect(r.provisionId).toBe("wcu-1");
  });

  it("points governingIndex at the second locus when the second one wins", () => {
    const c = conflict({ document: "Small-scale drawings" }, spec());
    expect(classifyConflict(c, [WCU]).governingIndex).toBe(1);
  });

  it("resolves a detail sheet against a plan sheet using the drawing sub-ranking", () => {
    // No specification side at all — the case a {spec, drawing} model cannot express.
    const c = conflict(
      { document: "Large-scale detail drawings", sheet: "A-501" },
      { document: "Small-scale drawings", sheet: "A-101" },
      "E2",
    );
    const r = classifyConflict(c, [WCU]);
    expect(r.class).toBe("precedence_resolvable");
    expect(governing(c, r)?.sheet).toBe("A-501");
  });

  it("explains which document won and why", () => {
    const r = classifyConflict(conflict(spec(), { document: "Small-scale drawings" }), [WCU]);
    expect(r.explanation).toMatch(/ranks Specifications above Small-scale drawings/);
  });

  it("does not rank a document the sequence never names", () => {
    const r = classifyConflict(conflict({ document: "Shop drawings" }, { document: "Product data" }), [WCU]);
    expect(r.class).toBe("requires_clarification");
    expect(r.governingIndex).toBeNull();
  });
});

describe("UCCS — a tied tier falling through to judgment", () => {
  it("cannot resolve drawings versus specifications, because they share a tier", () => {
    const r = classifyConflict(conflict(spec(), drawing()), [UCCS]);
    expect(r.class).toBe("precedence_ambiguous");
    expect(r.governingIndex).toBeNull();
  });

  it("explains that the stringency comparison is the reason", () => {
    const r = classifyConflict(conflict(spec(), drawing()), [UCCS]);
    expect(r.explanation).toMatch(/more stringent or higher quality/);
    expect(r.explanation).toMatch(/does not make for you/);
  });

  it("still resolves a conflict the sequence does rank", () => {
    // The positive control for the tie: the sequence is not broken, it just
    // does not discriminate within its last tier.
    const c = conflict({ document: "Agreement" }, { document: "General Conditions" });
    const r = classifyConflict(c, [UCCS]);
    expect(r.class).toBe("precedence_resolvable");
    expect(governing(c, r)?.document).toBe("Agreement");
  });

  it("fires the Special Provisions override before the sequence", () => {
    // Agreement is FIRST in the sequence; only an override applied before it
    // produces this answer.
    const c = conflict({ document: "Special Provisions" }, { document: "Agreement" });
    const r = classifyConflict(c, [UCCS]);
    expect(r.class).toBe("precedence_resolvable");
    expect(governing(c, r)?.document).toBe("Special Provisions");
    expect(r.explanation).toMatch(/notwithstanding the order of precedence/);
  });

  it("fires the change-order override over an original document", () => {
    const c = conflict({ document: "Change Orders" }, spec());
    expect(governing(c, classifyConflict(c, [UCCS]))?.document).toBe("Change Orders");
  });

  it("claims to settle nothing, despite looking as though it should settle E1", () => {
    expect(UCCS.resolves).toEqual([]);
  });
});

describe("North Macon — incorporated by reference and absent", () => {
  it("names the external instrument rather than resolving or reporting nothing", () => {
    const r = classifyConflict(conflict(spec(), drawing()), [NORTH_MACON]);
    expect(r.class).toBe("precedence_incorporated");
    expect(r.scope).toBe("external");
    expect(r.externalInstrument?.name).toMatch(/A201/);
    expect(r.explanation).toMatch(/not in this document set/);
  });
});

describe("Rees — a division-scoped rule", () => {
  it("classifies a Division 22 conflict as ambiguous via the section rule", () => {
    const r = classifyConflict(conflict(spec({ section: "22 00 00" }), drawing({ sheet: "P-101" })), [REES]);
    expect(r.class).toBe("precedence_ambiguous");
    expect(r.scope).toBe("division_scoped");
    expect(r.provisionId).toBe("rees-1");
  });

  it("does NOT reach a Division 08 door schedule conflict", () => {
    // The plumbing rule governs plumbing work. The project's none_found record
    // is what a conflict outside it cites.
    const r = classifyConflict(
      conflict(spec({ section: "08 71 00" }), drawing({ sheet: "A-601" })),
      [REES, REES_NONE_FOUND],
    );
    expect(r.class).toBe("no_precedence_provision");
    expect(r.scope).toBe("none_found");
    expect(r.provisionId).toBe("rees-none-found");
    expect(r.explanation).toMatch(/govern only 22/);
  });

  it("refuses a Division 08 conflict when there is no none_found record to cite", () => {
    // Taxonomy v1.2: a provision reference is never null. With nothing that
    // reaches the conflict and no record that the rest of the manual was
    // searched, there is nothing honest to cite.
    expect(() =>
      classifyConflict(conflict(spec({ section: "08 71 00" }), drawing()), [REES]),
    ).toThrow(NoProvisionRecordError);
  });

  it("derives the division from a section number", () => {
    expect(divisionOf({ document: "Specifications", section: "22 00 00" })).toBe("22");
    expect(divisionOf({ document: "Drawings" })).toBeNull();
  });
});

describe("choosing between provisions", () => {
  const wcuWithRees = [WCU, { ...REES, project: "wcu" }];

  it("prefers the division-scoped rule over a project-wide one", () => {
    const r = classifyConflict(conflict(spec({ section: "22 00 00" }), drawing()), wcuWithRees);
    expect(r.provisionId).toBe("rees-1");
    expect(r.class).toBe("precedence_ambiguous");
  });

  it("falls back to the project-wide rule outside the scoped division", () => {
    const r = classifyConflict(
      conflict(spec({ section: "08 71 00" }), { document: "Small-scale drawings" }),
      wcuWithRees,
    );
    expect(r.provisionId).toBe("wcu-1");
    expect(r.class).toBe("precedence_resolvable");
  });

  /**
   * Documented so it reads as intended rather than as something to tighten: a
   * division-scoped rule reaches a conflict when EITHER locus is in the
   * division, because drawings usually carry no division of their own.
   */
  it("reaches a conflict when EITHER locus is in the division, not only both", () => {
    expect(classifyConflict(conflict(spec({ section: "22 00 00" }), drawing()), [REES]).provisionId).toBe("rees-1");
    expect(classifyConflict(conflict(drawing(), spec({ section: "22 00 00" })), [REES]).provisionId).toBe("rees-1");
  });

  it("is NOT reached when neither locus is in the division", () => {
    expect(provisionReaches(REES, conflict(spec({ section: "08 71 00" }), drawing({ section: "09 00 00" })))).toBe(false);
    expect(provisionReaches(REES, conflict(spec({ section: "22 00 00" }), drawing()))).toBe(true);
  });
});

/** Test 7: absence of any record is an error; a none_found record is valid. */
describe("a project with no provision record", () => {
  it("is an error, not an implicit no_precedence_provision", () => {
    let caught: unknown;
    try {
      classifyConflict(conflict(spec(), drawing()), []);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NoProvisionRecordError);
    expect((caught as NoProvisionRecordError).kind).toBe("no_records");
    expect((caught as Error).message).toMatch(/none_found/);
  });

  it("classifies once the manual is recorded as searched with nothing found", () => {
    const r = classifyConflict(conflict(spec(), drawing()), [SEARCHED_NONE_FOUND]);
    expect(r.class).toBe("no_precedence_provision");
    expect(r.provisionId).toBe("searched-1");
    expect(r.scope).toBe("none_found");
  });

  it("never returns a classification without a provision to cite", () => {
    const cases: [DetectedConflict, typeof WCU[]][] = [
      [conflict(spec(), { document: "Small-scale drawings" }), [WCU]],
      [conflict(spec(), drawing()), [UCCS]],
      [conflict(spec(), drawing()), [NORTH_MACON]],
      [conflict(spec({ section: "22 00 00" }), drawing()), [REES]],
      [conflict(spec({ section: "08 71 00" }), drawing()), [REES, REES_NONE_FOUND]],
      [conflict(spec(), drawing()), [SEARCHED_NONE_FOUND]],
    ];
    for (const [c, provisions] of cases) {
      expect(classifyConflict(c, provisions).provisionId).toBeTruthy();
    }
  });
});

/**
 * `resolves` is a CLAIM, and this is what makes it checkable. A provision
 * saying it settles E2 is made to prove it.
 */
describe("the resolves claim is verified, not trusted", () => {
  const EXEMPLARS: Record<string, Partial<Record<ConflictClass, DetectedConflict>>> = {
    "wcu-1": {
      E1: conflict(spec(), { document: "Small-scale drawings" }, "E1"),
      E2: conflict({ document: "Large-scale detail drawings" }, { document: "Small-scale drawings" }, "E2"),
    },
  };
  const claiming = [WCU, UCCS, NORTH_MACON, REES].filter((p) => p.resolves.length > 0);

  it("every class a provision claims has an exemplar to prove it", () => {
    for (const p of claiming) {
      for (const cls of p.resolves) {
        expect(EXEMPLARS[p.id]?.[cls], `${p.id} claims ${cls} with no exemplar`).toBeDefined();
      }
    }
  });

  it("and the classifier actually returns resolvable for it", () => {
    for (const p of claiming) {
      for (const cls of p.resolves) {
        const exemplar = EXEMPLARS[p.id]![cls]!;
        expect(classifyConflict(exemplar, [p]).class, `${p.id} claims ${cls}`).toBe("precedence_resolvable");
      }
    }
  });

  it("a provision claiming nothing does not resolve the common conflict", () => {
    expect(classifyConflict(conflict(spec(), drawing()), [UCCS]).class).toBe("precedence_ambiguous");
  });
});

describe("DEFER", () => {
  const div22 = () => conflict(spec({ section: "22 00 00" }), drawing());
  const deferOnly = { ...REES, rules: REES.rules.filter((r) => r.type === "DEFER") };

  it("names what it defers to instead of falling through", () => {
    const r = classifyConflict(div22(), [deferOnly]);
    expect(r.class).toBe("requires_clarification");
    expect(r.explanation).toMatch(/Division 01/);
  });

  it("says so plainly when the deferred-to document is absent", () => {
    const r = classifyConflict(div22(), [deferOnly], { availableDocuments: ["Division 22"] });
    expect(r.explanation).toMatch(/NOT in this document set/);
  });

  it("points at it when present", () => {
    const r = classifyConflict(div22(), [deferOnly], { availableDocuments: ["Division 01", "Division 22"] });
    expect(r.explanation).toMatch(/is in this document set/);
  });

  it("admits it cannot tell when availability is unknown", () => {
    expect(classifyConflict(div22(), [deferOnly]).explanation).toMatch(/cannot determine/);
  });

  it("is reached only after the rules above it", () => {
    expect(classifyConflict(div22(), [REES]).class).toBe("precedence_ambiguous");
  });
});

describe("provisional constructs", () => {
  it("flags an outcome decided by a single-observation construct", () => {
    const r = classifyConflict(conflict({ document: "Special Provisions" }, { document: "Agreement" }), [UCCS]);
    expect(r.class).toBe("precedence_resolvable");
    expect(r.provisional).toBe(true);
    expect(r.provisionalReason).toMatch(/1 of 4/);
  });

  it("does not flag one decided by an established construct", () => {
    const r = classifyConflict(conflict(spec(), { document: "Small-scale drawings" }), [WCU]);
    expect(r.provisional).toBe(false);
    expect(r.provisionalReason).toBeNull();
  });

  it("records provenance for every rule type, so a new one cannot skip it", () => {
    for (const t of ["OVERRIDE", "RANK_SEQUENCE", "STRINGENCY", "DISCRETION", "DEFER"] as const) {
      expect(RULE_PROVENANCE[t]).toBeDefined();
    }
  });

  /** Test 8: every single-observation construct carries the marker. */
  it("marks every construct seen in only one manual as provisional", () => {
    for (const [type, provenance] of Object.entries(RULE_PROVENANCE)) {
      if (provenance.observedIn === 1) expect(provenance.provisional, type).toBe(true);
    }
    expect(provisionalRuleTypes().sort()).toEqual(["DEFER", "DISCRETION", "OVERRIDE"]);
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

