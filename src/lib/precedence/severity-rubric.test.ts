import { describe, expect, it } from "vitest";

import { resolveSeverity, SEVERITY_EXAMPLES, SEVERITY_RUBRIC } from "./severity-rubric";
import { SEVERITY_BANDS } from "./vocabulary";

const ALLOWED = /^(aec_bench:(wcu|uccs|north_macon|rees)|synthetic)$/;

describe("severity rubric", () => {
  it("10. no few-shot example lacks a provenance tag, and none comes from elsewhere", () => {
    for (const e of SEVERITY_EXAMPLES) expect(e.source, e.description).toMatch(ALLOWED);
  });

  it("has an example for every band", () => {
    for (const band of SEVERITY_BANDS) expect(SEVERITY_EXAMPLES.some((e) => e.band === band), band).toBe(true);
  });

  it("sub-types exactly the E1 examples", () => {
    for (const e of SEVERITY_EXAMPLES) expect(e.conflict_subtype === null, e.description).toBe(e.conflict_class !== "E1");
  });

  it("the higher band governs", () => {
    expect(resolveSeverity(["low", "high", "medium"])).toBe("high");
    expect(resolveSeverity([])).toBe("low");
  });

  it("a fire-rated performance_rating conflict is always high", () => {
    expect(resolveSeverity(["low"], { subtype: "performance_rating", fireRated: true })).toBe("high");
    expect(resolveSeverity(["low"], { subtype: "performance_rating", fireRated: false })).toBe("low");
  });

  it("beneficial_exceedance is low unless a higher criterion applies", () => {
    expect(resolveSeverity([], { subtype: "beneficial_exceedance" })).toBe("low");
    expect(resolveSeverity(["high"], { subtype: "beneficial_exceedance" })).toBe("high");
  });

  it("never references schedule, dispute likelihood, cost estimates, or likelihood bands", () => {
    // The rubric's closing line names what NOT to weigh; everything above it must not mention them.
    const criteria = SEVERITY_RUBRIC.split("Judge what is at stake")[0];
    expect(criteria).not.toMatch(/schedule|critical path|dispute|estimate|likelihood|4\s*[x×]\s*4|critical/i);
  });
});
