import { describe, expect, it } from "vitest";

import {
  afterRejection,
  reconstructState,
  resolveApprovers,
  selectTemplate,
  type ActionRecord,
  type OnReject,
  type SnapshotStep,
  type TemplateSnapshot,
} from "./rules";

function step(order: number, over: Partial<SnapshotStep> = {}): SnapshotStep {
  return {
    step_order: order,
    name: `Step ${order}`,
    approver_mode: "any_of_users",
    approver_role: "",
    approver_users: ["u1"],
    sla_days: null,
    on_reject: "return_to_start",
    ...over,
  };
}

function snapshot(steps: SnapshotStep[]): TemplateSnapshot {
  return {
    template: { id: "t1", name: "Standard", entity_type: "submittal", project: "" },
    steps,
  };
}

let clock = 0;
function at(actor: string, action: ActionRecord["action"], stepOrder: number): ActionRecord {
  clock += 1000;
  return { actor, action, step_order: stepOrder, acted_at: new Date(clock).toISOString() };
}

describe("selectTemplate", () => {
  const org = { id: "org", entity_type: "submittal" as const, project: "", active: true };
  const scoped = { id: "scoped", entity_type: "submittal" as const, project: "p1", active: true };

  it("prefers a project-scoped template over the org-wide default", () => {
    expect(selectTemplate([org, scoped], "submittal", "p1")?.id).toBe("scoped");
  });

  it("falls back to the org-wide default for other projects", () => {
    expect(selectTemplate([org, scoped], "submittal", "p2")?.id).toBe("org");
  });

  it("returns null when nothing is active — no workflow is not an error", () => {
    expect(selectTemplate([{ ...org, active: false }], "submittal", "p1")).toBeNull();
  });

  it("never crosses entity types", () => {
    expect(selectTemplate([org], "rfi", "p1")).toBeNull();
  });

  it("ignores an inactive project template rather than preferring it", () => {
    expect(selectTemplate([org, { ...scoped, active: false }], "submittal", "p1")?.id).toBe("org");
  });
});

describe("afterRejection", () => {
  const three = snapshot([step(1), step(2), step(3)]);

  it("return_to_start goes back to the first step", () => {
    const s = afterRejection(step(3, { on_reject: "return_to_start" }), 3, three);
    expect(s).toEqual({ status: "pending", current_step_order: 1 });
  });

  it("return_to_previous goes back exactly one step", () => {
    const s = afterRejection(step(3, { on_reject: "return_to_previous" }), 3, three);
    expect(s).toEqual({ status: "pending", current_step_order: 2 });
  });

  it("terminate ends the workflow", () => {
    const s = afterRejection(step(2, { on_reject: "terminate" }), 2, three);
    expect(s.status).toBe("rejected");
  });

  it("return_to_previous at the first step has nowhere to go and stays put", () => {
    // Falling off the front would set step 0, which no step matches, and the
    // workflow would become unactionable with nothing to explain why.
    const s = afterRejection(step(1, { on_reject: "return_to_previous" }), 1, three);
    expect(s).toEqual({ status: "pending", current_step_order: 1 });
  });
});

describe("reconstructState", () => {
  const three = snapshot([step(1), step(2), step(3)]);

  it("starts pending at the first step with no actions", () => {
    expect(reconstructState([], three)).toEqual({ status: "pending", current_step_order: 1 });
  });

  it("advances one step per approval", () => {
    expect(reconstructState([at("u1", "approve", 1)], three)).toEqual({
      status: "pending",
      current_step_order: 2,
    });
  });

  it("approving the last step approves the workflow", () => {
    const actions = [at("u1", "approve", 1), at("u1", "approve", 2), at("u1", "approve", 3)];
    expect(reconstructState(actions, three).status).toBe("approved");
  });

  it("ignores an approval cast against a step that already moved", () => {
    // The replay equivalent of the concurrency guard: a stale action is
    // recorded but must not advance anything.
    const actions = [at("u1", "approve", 1), at("u2", "approve", 1)];
    expect(reconstructState(actions, three)).toEqual({ status: "pending", current_step_order: 2 });
  });

  it("comments never change state", () => {
    const actions = [at("u1", "comment", 1), at("u1", "comment", 1)];
    expect(reconstructState(actions, three)).toEqual({ status: "pending", current_step_order: 1 });
  });

  it("replays a rejection back to start and a later re-approval to completion", () => {
    const actions = [
      at("u1", "approve", 1),
      at("u1", "approve", 2),
      at("u1", "reject", 3), // on_reject: return_to_start
      at("u1", "approve", 1),
      at("u1", "approve", 2),
      at("u1", "approve", 3),
    ];
    expect(reconstructState(actions, three)).toEqual({ status: "approved", current_step_order: 3 });
  });

  it("a rejection clears approvals so they must be given again", () => {
    const actions = [at("u1", "approve", 1), at("u1", "reject", 2), at("u1", "approve", 1)];
    // Back to start, then step 1 re-approved — at step 2 again, not further.
    expect(reconstructState(actions, three)).toEqual({ status: "pending", current_step_order: 2 });
  });

  it("cancel is terminal and later actions do not revive it", () => {
    const actions = [at("u1", "cancel", 1), at("u1", "approve", 1)];
    expect(reconstructState(actions, three).status).toBe("cancelled");
  });

  it("specific_users requires every named approver before advancing", () => {
    const both = snapshot([
      step(1, { approver_mode: "specific_users", approver_users: ["u1", "u2"] }),
      step(2),
    ]);
    expect(reconstructState([at("u1", "approve", 1)], both).current_step_order).toBe(1);
    expect(
      reconstructState([at("u1", "approve", 1), at("u2", "approve", 1)], both).current_step_order,
    ).toBe(2);
  });

  it("any_of_users advances on a single approval", () => {
    const either = snapshot([
      step(1, { approver_mode: "any_of_users", approver_users: ["u1", "u2"] }),
      step(2),
    ]);
    expect(reconstructState([at("u2", "approve", 1)], either).current_step_order).toBe(2);
  });

  it("the same approver twice does not satisfy specific_users", () => {
    const both = snapshot([
      step(1, { approver_mode: "specific_users", approver_users: ["u1", "u2"] }),
      step(2),
    ]);
    const actions = [at("u1", "approve", 1), at("u1", "approve", 1)];
    expect(reconstructState(actions, both).current_step_order).toBe(1);
  });

  it("orders by acted_at, not array position", () => {
    const a = { actor: "u1", action: "approve" as const, step_order: 1, acted_at: "2026-01-02T00:00:00Z" };
    const b = { actor: "u1", action: "reject" as const, step_order: 1, acted_at: "2026-01-01T00:00:00Z" };
    // The reject happened first, so it applies first and the approve then moves
    // step 1 forward. Passing them out of order must not change the answer.
    expect(reconstructState([a, b], three)).toEqual(reconstructState([b, a], three));
  });

  it.each<[OnReject, number, string]>([
    ["return_to_start", 1, "pending"],
    ["return_to_previous", 2, "pending"],
    ["terminate", 3, "rejected"],
  ])("replays on_reject=%s to step %i (%s)", (mode, order, status) => {
    const s = snapshot([step(1), step(2), step(3, { on_reject: mode })]);
    const actions = [at("u1", "approve", 1), at("u1", "approve", 2), at("u1", "reject", 3)];
    const result = reconstructState(actions, s);
    expect(result.status).toBe(status);
    expect(result.current_step_order).toBe(order);
  });
});

describe("resolveApprovers", () => {
  it("reads user ids straight from the snapshot for user modes", () => {
    expect(resolveApprovers(step(1, { approver_users: ["a", "b", "a"] }), {})).toEqual(["a", "b"]);
  });

  it("resolves a role against the supplied project roles", () => {
    const s = step(1, { approver_mode: "role", approver_role: "architect", approver_users: [] });
    expect(resolveApprovers(s, { architect: ["u9"] })).toEqual(["u9"]);
  });

  it("an unfilled role yields nobody rather than everybody", () => {
    const s = step(1, { approver_mode: "role", approver_role: "architect", approver_users: [] });
    expect(resolveApprovers(s, {})).toEqual([]);
  });

  it("resolves from a snapshot that no longer matches the live template", () => {
    // The property that makes snapshots worth taking: the caller holds the
    // frozen step, so whatever happened to the template since is irrelevant.
    const frozen = step(1, { approver_users: ["original"] });
    const liveTemplateChangedTo = step(1, { approver_users: ["replacement"] });
    expect(resolveApprovers(frozen, {})).toEqual(["original"]);
    expect(resolveApprovers(liveTemplateChangedTo, {})).toEqual(["replacement"]);
  });
});
