/**
 * Integrity tests for the taxonomy v1.2 output contract (tests 1–6 and 9).
 * They check that the contract refuses what v1.2 forbids. Detection accuracy
 * is not tested here; that belongs to the evaluation harness, not PocketPM.
 */
import { describe, expect, it } from "vitest";

import { classifyConflict } from "./classify";
import {
  parseConflictRecord,
  parseProvisionRecord,
  toConflictRecord,
  toProvisionRecord,
  TAXONOMY_VERSION,
} from "./contract";
import { NORTH_MACON, REES, REES_NONE_FOUND, SEARCHED_NONE_FOUND, UCCS, WCU } from "./fixtures";

const valid = () => ({
  conflict_id: "c-1",
  taxonomy_version: "1.2",
  conflict_class: "E1",
  conflict_subtype: "material_type",
  between: [
    { document: "Specifications", section: "09 30 00", paragraph: "2.1.A" },
    { document: "Drawings", sheet: "A-601" },
  ],
  precedence_class: "precedence_resolvable",
  precedence_provision_ref: "wcu-1",
  precedence_reasoning: "WCU ranks Specifications above drawings.",
  governing_index: 0,
  ai_severity_band: "medium",
  provisional_construct_used: false,
});

const rejects = (over: Record<string, unknown>) => expect(parseConflictRecord({ ...valid(), ...over }).ok).toBe(false);

describe("conflict record", () => {
  it("accepts a well-formed record", () => {
    expect(parseConflictRecord(valid())).toMatchObject({ ok: true });
  });

  it("1. rejects E1 without a subtype, and E3 with one", () => {
    rejects({ conflict_subtype: null });
    rejects({ conflict_class: "E3", conflict_subtype: "material_type", between: [{ document: "Specifications", section: "09 30 00" }, { document: "Specifications", section: "09 91 00" }] });
  });

  it("2. rejects governing_index off a non-resolvable class, and its absence on a resolvable one", () => {
    rejects({ precedence_class: "precedence_ambiguous", governing_index: 0 });
    rejects({ governing_index: null });
    rejects({ governing_index: 2 });
  });

  it("3. rejects a null or missing provision reference", () => {
    rejects({ precedence_provision_ref: null });
    rejects({ precedence_provision_ref: "" });
    const missing: Record<string, unknown> = valid();
    delete missing.precedence_provision_ref;
    expect(parseConflictRecord(missing).ok).toBe(false);
  });

  it("4. requires exactly two loci; accepts E2 drawing–drawing and E3 spec–spec", () => {
    const one = [{ document: "Drawings", sheet: "A-101" }];
    rejects({ between: one });
    rejects({ between: [...valid().between, { document: "Drawings", sheet: "A-102" }] });

    const e2 = { ...valid(), conflict_class: "E2", conflict_subtype: null, between: [{ document: "Drawings", sheet: "A-501", detail: "3" }, { document: "Drawings", sheet: "A-101" }] };
    const e3 = { ...valid(), conflict_class: "E3", conflict_subtype: null, between: [{ document: "Specifications", section: "08 71 00" }, { document: "Specifications", section: "08 11 13", page: 212 }] };
    expect(parseConflictRecord(e2).ok).toBe(true);
    expect(parseConflictRecord(e3).ok).toBe(true);
  });

  it("4a. rejects a locus that is both a drawing and a specification", () => {
    rejects({ between: [{ document: "Drawings", sheet: "A-101", section: "09 30 00" }, { document: "Drawings" }] });
  });

  it("5. rejects empty reasoning", () => {
    rejects({ precedence_reasoning: "" });
    rejects({ precedence_reasoning: "   " });
  });

  it("6. rejects the removed fields rather than dropping them", () => {
    rejects({ ai_likelihood_band: "medium" });
    rejects({ likelihood_signed_error: 0 });
    rejects({ requires_clarification: true });
    rejects({ spec_locus: { document: "Specifications" } });
    rejects({ dwg_locus: { document: "Drawings" } });
  });

  it("9. rejects any taxonomy_version other than 1.2, naming what it can read", () => {
    for (const v of ["1.1", "1.3", 1.2, null, undefined]) {
      const result = parseConflictRecord({ ...valid(), taxonomy_version: v });
      expect(result.ok, String(v)).toBe(false);
      if (!result.ok) expect(result.issues[0]).toMatch(/this build reads 1\.2/);
    }
    expect(TAXONOMY_VERSION).toBe("1.2");
  });

  it("rejects an unknown severity band, including the old four-band values", () => {
    rejects({ ai_severity_band: "critical" });
    rejects({ ai_severity_band: undefined });
  });
});

describe("provision record", () => {
  it("emits every AEC-Bench fixture as a valid v1.2 record", () => {
    for (const p of [WCU, UCCS, NORTH_MACON, REES, REES_NONE_FOUND, SEARCHED_NONE_FOUND]) {
      const record = toProvisionRecord(p);
      expect(record.taxonomy_version).toBe("1.2");
      expect(record.source).toBe("human_supplied_and_confirmed");
      expect(parseProvisionRecord(record).ok, p.id).toBe(true);
    }
  });

  it("requires scope_target iff division_scoped, and external_instrument iff external", () => {
    const rees = toProvisionRecord(REES);
    expect(parseProvisionRecord({ ...rees, scope_target: null }).ok).toBe(false);
    expect(parseProvisionRecord({ ...toProvisionRecord(WCU), scope_target: "22" }).ok).toBe(false);
    const macon = toProvisionRecord(NORTH_MACON);
    expect(parseProvisionRecord({ ...macon, external_instrument: null }).ok).toBe(false);
    expect(parseProvisionRecord({ ...toProvisionRecord(WCU), external_instrument: macon.external_instrument }).ok).toBe(false);
  });

  it("requires the searcher's note on a none_found record, and refuses any other source", () => {
    const none = toProvisionRecord(SEARCHED_NONE_FOUND);
    expect(parseProvisionRecord({ ...none, source_text: "" }).ok).toBe(false);
    expect(parseProvisionRecord({ ...none, source: "extracted" }).ok).toBe(false);
    expect(parseProvisionRecord({ ...none, resolves_drawing_vs_spec: false }).ok).toBe(false);
  });
});

describe("emitting from the classifier", () => {
  it("builds a valid record for every precedence class", () => {
    const cases = [
      [{ conflict_class: "E1" as const, conflict_subtype: "material_type" as const, between: [{ document: "Specifications" }, { document: "Small-scale drawings" }] as const }, [WCU]],
      [{ conflict_class: "E1" as const, conflict_subtype: "system_type" as const, between: [{ document: "Specifications" }, { document: "Drawings" }] as const }, [UCCS]],
      [{ conflict_class: "E1" as const, conflict_subtype: "grade_standard" as const, between: [{ document: "Specifications" }, { document: "Drawings" }] as const }, [NORTH_MACON]],
      [{ conflict_class: "E3" as const, between: [{ document: "Shop drawings" }, { document: "Product data" }] as const }, [WCU]],
      [{ conflict_class: "E1" as const, conflict_subtype: "frame_material" as const, between: [{ document: "Specifications", section: "08 71 00" }, { document: "Drawings" }] as const }, [REES, REES_NONE_FOUND]],
    ] as const;
    const seen = new Set<string>();
    for (const [c, provisions] of cases) {
      const conflict = { ...c, between: [...c.between] as [typeof c.between[0], typeof c.between[1]] };
      const record = toConflictRecord({ conflictId: "x", conflict, classification: classifyConflict(conflict, provisions), severity: "low" });
      expect(parseConflictRecord(record).ok).toBe(true);
      seen.add(record.precedence_class);
    }
    expect(seen.size).toBe(5);
  });

  it("marks a record decided by a provisional construct", () => {
    const conflict = { conflict_class: "E1" as const, conflict_subtype: "method_sequence" as const, between: [{ document: "Special Provisions" }, { document: "Agreement" }] as [{ document: string }, { document: string }] };
    const record = toConflictRecord({ conflictId: "x", conflict, classification: classifyConflict(conflict, [UCCS]), severity: "medium" });
    expect(record.provisional_construct_used).toBe(true);
  });

  it("refuses to emit an E1 record the detector forgot to sub-type", () => {
    const conflict = { conflict_class: "E1" as const, between: [{ document: "Specifications" }, { document: "Small-scale drawings" }] as [{ document: string }, { document: string }] };
    expect(() => toConflictRecord({ conflictId: "x", conflict, classification: classifyConflict(conflict, [WCU]), severity: "low" })).toThrow(/conflict_subtype/);
  });
});
