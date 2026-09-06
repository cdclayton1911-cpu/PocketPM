import { describe, expect, it } from "vitest";

import {
  APPROVER_MODE_LABEL,
  findActiveConflict,
  moveStep,
  parseTemplateSubmission,
  renumber,
  workflowStepSchema,
  workflowTemplateSchema,
} from "./workflow-template";

const roleStep = {
  step_order: 1,
  name: "Architect review",
  approver_mode: "role" as const,
  approver_role: "architect",
  approver_users: [],
  sla_days: 5,
  on_reject: "return_to_start" as const,
};

const userStep = {
  step_order: 2,
  name: "PM sign-off",
  approver_mode: "specific_users" as const,
  approver_role: "",
  approver_users: ["u1", "u2"],
  sla_days: null,
  on_reject: "return_to_previous" as const,
};

const template = {
  name: "Standard submittal",
  entity_type: "submittal" as const,
  project: "p1",
  active: true,
  description: "",
  steps: [roleStep, userStep],
};

describe("the refinement that broke ProjectRoleDialog", () => {
  it("does not throw when validating an edit", () => {
    // The fc704da regression: .partial() on a refined schema throws. The edit
    // path must build from the unrefined object instead.
    expect(() => parseTemplateSubmission(template, true)).not.toThrow();
  });

  it("accepts an edit and drops the frozen project field", () => {
    const result = parseTemplateSubmission(template, true);
    expect(result.success).toBe(true);
    // project is frozen by the collection rule; sending it would fail the
    // update rule, so it must not survive validation.
    if (result.success) expect("project" in result.data).toBe(false);
  });

  it("still requires project on create", () => {
    const withoutProject = { ...template, project: "" };
    expect(parseTemplateSubmission(withoutProject, false).success).toBe(false);
  });
});

describe("approver_mode conditional validation", () => {
  it("requires a role when the mode is role", () => {
    expect(workflowStepSchema.safeParse({ ...roleStep, approver_role: "" }).success).toBe(false);
  });

  it("requires users when the mode is specific_users", () => {
    expect(workflowStepSchema.safeParse({ ...userStep, approver_users: [] }).success).toBe(false);
  });

  it("requires users when the mode is any_of_users", () => {
    const step = { ...userStep, approver_mode: "any_of_users" as const, approver_users: [] };
    expect(workflowStepSchema.safeParse(step).success).toBe(false);
  });

  it("does not demand users for a role step, nor a role for a user step", () => {
    expect(workflowStepSchema.safeParse(roleStep).success).toBe(true);
    expect(workflowStepSchema.safeParse(userStep).success).toBe(true);
  });

  it("reports the problem against a step index, not the whole form", () => {
    const bad = { ...template, steps: [roleStep, { ...userStep, approver_users: [] }] };
    const result = workflowTemplateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["steps", 1, "approver_role"]);
  });

  it("refuses a template with no steps", () => {
    expect(workflowTemplateSchema.safeParse({ ...template, steps: [] }).success).toBe(false);
  });

  it("refuses two steps in the same position", () => {
    const clash = { ...template, steps: [roleStep, { ...userStep, step_order: 1 }] };
    expect(workflowTemplateSchema.safeParse(clash).success).toBe(false);
  });

  it("keeps sla_days null distinct from zero", () => {
    // null means no SLA; 0 would mean due immediately. Collapsing them would
    // make every step without an SLA look overdue on the day it opens.
    const parsed = workflowStepSchema.safeParse({ ...roleStep, sla_days: null });
    expect(parsed.success && parsed.data.sla_days).toBeNull();
    const zero = workflowStepSchema.safeParse({ ...roleStep, sla_days: 0 });
    expect(zero.success && zero.data.sla_days).toBe(0);
  });
});

describe("the mode labels", () => {
  it("say that the two user modes differ", () => {
    // If these ever read the same, the only place a user learns the difference
    // is gone — the engine would still behave differently.
    expect(APPROVER_MODE_LABEL.specific_users).not.toBe(APPROVER_MODE_LABEL.any_of_users);
    expect(APPROVER_MODE_LABEL.specific_users).toMatch(/all/i);
    expect(APPROVER_MODE_LABEL.any_of_users).toMatch(/any one/i);
  });
});

describe("findActiveConflict", () => {
  const existing = [
    { id: "t1", entity_type: "submittal", project: "p1", active: true },
    { id: "t2", entity_type: "rfi", project: "p1", active: true },
  ];

  it("finds the template that would collide", () => {
    const c = findActiveConflict(existing, { entity_type: "submittal", project: "p1", active: true });
    expect(c?.id).toBe("t1");
  });

  it("does not report a template colliding with itself", () => {
    const c = findActiveConflict(existing, { id: "t1", entity_type: "submittal", project: "p1", active: true });
    expect(c).toBeNull();
  });

  it("allows a second inactive template", () => {
    expect(findActiveConflict(existing, { entity_type: "submittal", project: "p1", active: false })).toBeNull();
  });

  it("scopes the conflict to the same entity type and project", () => {
    expect(findActiveConflict(existing, { entity_type: "submittal", project: "p2", active: true })).toBeNull();
  });
});

describe("step reordering", () => {
  const steps = [
    { step_order: 1, name: "a" },
    { step_order: 2, name: "b" },
    { step_order: 3, name: "c" },
  ];

  it("renumbers contiguously from one", () => {
    expect(renumber([{ step_order: 7, name: "x" }])).toEqual([{ step_order: 1, name: "x" }]);
  });

  it("moves a step down and renumbers", () => {
    expect(moveStep(steps, 0, 2).map((s) => s.name)).toEqual(["b", "c", "a"]);
    expect(moveStep(steps, 0, 2).map((s) => s.step_order)).toEqual([1, 2, 3]);
  });

  it("moves a step up", () => {
    expect(moveStep(steps, 2, 0).map((s) => s.name)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for out-of-range indices, still renumbering", () => {
    expect(moveStep(steps, 0, 9).map((s) => s.name)).toEqual(["a", "b", "c"]);
    expect(moveStep(steps, -1, 1).map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});
