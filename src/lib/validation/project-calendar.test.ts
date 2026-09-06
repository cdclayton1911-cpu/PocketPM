import { describe, expect, it } from "vitest";

import { projectSchema } from "./project";

/**
 * These exist because Zod strips unknown keys.
 *
 * Before work_days and holidays were added to the schema, a calendar PATCH
 * validated cleanly, returned 200, and discarded the calendar — the same
 * silent-drop failure revisionUpdateSchema had. A test that only checked the
 * status code would have passed.
 */
describe("the project schema carries the calendar fields", () => {
  it("keeps work_days rather than stripping it", () => {
    const parsed = projectSchema.partial().safeParse({ work_days: [1, 2, 3, 4, 5] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.work_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps holidays, including the optional label", () => {
    const parsed = projectSchema
      .partial()
      .safeParse({ holidays: [{ date: "2026-12-25", label: "Christmas" }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.holidays).toEqual([{ date: "2026-12-25", label: "Christmas" }]);
  });

  it("refuses a weekday outside 0-6", () => {
    expect(projectSchema.partial().safeParse({ work_days: [1, 7] }).success).toBe(false);
    expect(projectSchema.partial().safeParse({ work_days: [-1] }).success).toBe(false);
  });

  it("refuses a non-integer weekday", () => {
    expect(projectSchema.partial().safeParse({ work_days: [1.5] }).success).toBe(false);
  });

  it("refuses a holiday with no date", () => {
    expect(projectSchema.partial().safeParse({ holidays: [{ label: "Christmas" }] }).success).toBe(
      false,
    );
  });

  it("refuses an unknown key on a holiday rather than dropping it", () => {
    // strictObject: a typo'd field name is an error, not a silent omission.
    const parsed = projectSchema
      .partial()
      .safeParse({ holidays: [{ date: "2026-12-25", name: "Christmas" }] });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty calendar", () => {
    expect(projectSchema.partial().safeParse({ work_days: [], holidays: [] }).success).toBe(true);
  });
});
