import { describe, expect, it } from "vitest";

import { CONFLICT_CLASS_LABEL, E1_SUBTYPE_LABEL, PRECEDENCE_CLASS_LABEL, SCOPE_LABEL, SEVERITY_LABEL } from "./labels";
import { CONFLICT_CLASSES, E1_SUBTYPES, PRECEDENCE_CLASSES, PRECEDENCE_SCOPES, SEVERITY_BANDS } from "./vocabulary";

/** Every internal value has plain GC wording, and none of it is the internal value itself. */
const cases: [string, readonly string[], (v: string) => string | undefined][] = [
  ["precedence class", PRECEDENCE_CLASSES, (v) => PRECEDENCE_CLASS_LABEL[v as keyof typeof PRECEDENCE_CLASS_LABEL]?.label],
  ["severity", SEVERITY_BANDS, (v) => SEVERITY_LABEL[v as keyof typeof SEVERITY_LABEL]?.label],
  ["scope", PRECEDENCE_SCOPES, (v) => SCOPE_LABEL[v as keyof typeof SCOPE_LABEL]],
  ["conflict class", CONFLICT_CLASSES, (v) => CONFLICT_CLASS_LABEL[v as keyof typeof CONFLICT_CLASS_LABEL]],
  ["E1 subtype", E1_SUBTYPES, (v) => E1_SUBTYPE_LABEL[v as keyof typeof E1_SUBTYPE_LABEL]],
];

describe("every enum value has a plain-language label", () => {
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
});
