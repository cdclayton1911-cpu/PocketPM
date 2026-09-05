import { describe, expect, it } from "vitest";

import { parseProjectRoleSubmission, projectRoleSchema } from "./project-role";

/**
 * The regression these exist for: the dialog called
 * `projectRoleSchema.partial()` on an edit. Zod THROWS on that when the schema
 * carries a refinement, so the submit handler died before sending anything —
 * a silent failure that looked like a rejected write. Typecheck and build both
 * passed, because `.partial` exists on the type and fails only at runtime.
 */
describe("parseProjectRoleSubmission", () => {
  const external = { role: "architect", contact_name: "A. Vasquez" };

  it("does not throw when editing — the bug was a crash, not a rejection", () => {
    expect(() =>
      parseProjectRoleSubmission({ contact_phone: "555-0100" }, external),
    ).not.toThrow();
  });

  it("accepts an edit that touches only one unrelated field", () => {
    const result = parseProjectRoleSubmission({ contact_phone: "555-0100" }, external);
    expect(result.success).toBe(true);
  });

  it("checks the invariant against the merged record, not the patch alone", () => {
    // contact_name is absent from the patch but present on the record, so this
    // must pass — rejecting it would make every partial edit impossible.
    const result = parseProjectRoleSubmission({ company: "AE Partners" }, external);
    expect(result.success).toBe(true);
  });

  it("still refuses an edit that would leave the row naming nobody", () => {
    const result = parseProjectRoleSubmission({ contact_name: "" }, external);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["contact_name"]);
    }
  });

  it("keeps the linked account when the patch omits it", () => {
    const linked = { user: "abc123", contact_name: "" };
    expect(parseProjectRoleSubmission({ company: "Owner Rep Inc" }, linked).success).toBe(true);
  });

  it("still validates a create through the refined schema", () => {
    expect(projectRoleSchema.safeParse({ role: "architect" }).success).toBe(false);
    expect(projectRoleSchema.safeParse(external).success).toBe(true);
  });
});
