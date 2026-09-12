/**
 * One AEC-Bench project end to end: the WCU provision, recorded, then two
 * hand-specified conflicts (an E1 and an E2) classified and emitted as v1.2
 * records. The conflicts are synthetic; WCU's clause is real (p.89).
 */
import { describe, expect, it } from "vitest";

import { classifyConflict } from "./classify";
import { parseConflictRecord, parseProvisionRecord, toConflictRecord, toProvisionRecord } from "./contract";
import { WCU } from "./fixtures";
import type { DetectedConflict } from "./types";

export const WCU_E1: DetectedConflict = {
  conflict_class: "E1",
  conflict_subtype: "material_thickness",
  between: [
    { document: "Specifications", section: "05 40 00", paragraph: "2.2.B" },
    { document: "Small-scale drawings", sheet: "A-301" },
  ],
};

export const WCU_E2: DetectedConflict = {
  conflict_class: "E2",
  between: [
    { document: "Small-scale drawings", sheet: "A-101" },
    { document: "Large-scale detail drawings", sheet: "A-501", detail: "4" },
  ],
};

export function runWcu() {
  const provision = toProvisionRecord(WCU);
  const e1 = toConflictRecord({ conflictId: "wcu-c1", conflict: WCU_E1, classification: classifyConflict(WCU_E1, [WCU]), severity: "high" });
  const e2 = toConflictRecord({ conflictId: "wcu-c2", conflict: WCU_E2, classification: classifyConflict(WCU_E2, [WCU]), severity: "medium" });
  return { provision, conflicts: [e1, e2] };
}

describe("WCU end to end", () => {
  it("emits a valid provision record and two valid conflict records", () => {
    const { provision, conflicts } = runWcu();
    expect(parseProvisionRecord(provision).ok).toBe(true);
    for (const c of conflicts) expect(parseConflictRecord(c).ok).toBe(true);
    expect(conflicts.map((c) => [c.precedence_class, c.governing_index])).toEqual([
      ["precedence_resolvable", 0],
      ["precedence_resolvable", 1],
    ]);
    expect(conflicts.every((c) => c.precedence_provision_ref === provision.provision_id)).toBe(true);
  });
});
