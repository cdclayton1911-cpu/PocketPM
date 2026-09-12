import { describe, expect, it } from "vitest";

import { SCHEDULE_ITEM_ACTIVITY_TYPE, SCHEDULE_ITEM_CONSTRAINT_TYPE } from "@/types/enums";

import { DIVERGENCE_CAUSES } from "./divergence";
import { ACTIVITY_TYPE_LABEL, CONSTRAINT_TYPE_LABEL, constraintLabel, DIVERGENCE_CAUSE_LABEL } from "./labels";

/**
 * Every internal value has plain wording, and none of it is the value itself.
 * The value lists come from the generated schema enums, so a new select value
 * added to PocketBase fails here until it is worded.
 */
const cases: [string, readonly string[], (v: string) => string | undefined][] = [
  ["activity type", SCHEDULE_ITEM_ACTIVITY_TYPE, (v) => ACTIVITY_TYPE_LABEL[v as keyof typeof ACTIVITY_TYPE_LABEL]],
  ["constraint type", SCHEDULE_ITEM_CONSTRAINT_TYPE, (v) => CONSTRAINT_TYPE_LABEL[v as keyof typeof CONSTRAINT_TYPE_LABEL]],
  ["divergence cause", DIVERGENCE_CAUSES, (v) => DIVERGENCE_CAUSE_LABEL[v as keyof typeof DIVERGENCE_CAUSE_LABEL]?.label],
];

describe("every schedule value has a plain-language label", () => {
  for (const [name, values, label] of cases) {
    it(name, () => {
      for (const v of values) {
        const text = label(v);
        expect(text, `${name} ${v} has no label`).toBeTruthy();
        expect(text, `${name} ${v} is labelled with its internal value`).not.toBe(v);
        expect(text).not.toMatch(/_/);
      }
    });
  }

  it("never shows an unknown constraint's internal value", () => {
    expect(constraintLabel("some_future_constraint")).toBe("A constraint");
    expect(constraintLabel(null)).toBeNull();
  });
});
