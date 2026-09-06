/**
 * The workflow engine's decision logic, as pure functions.
 *
 * Deliberately free of PocketBase and of `server-only`: everything here is
 * reachable from a unit test. The engine module does the IO and calls these to
 * decide what should happen.
 *
 * ## The snapshot is the only source of step data
 *
 * Every function reads steps from an instance's `template_snapshot`, never from
 * the live template. Editing a template must not alter a workflow already in
 * flight — otherwise the audit log describes steps that no longer exist, and
 * "who was allowed to approve this" becomes unanswerable after the fact.
 */

export type ApproverMode = "role" | "specific_users" | "any_of_users";
export type OnReject = "return_to_previous" | "return_to_start" | "terminate";
export type WorkflowStatus = "pending" | "approved" | "rejected" | "cancelled";
export type WorkflowActionKind =
  | "start"
  | "approve"
  | "reject"
  | "comment"
  | "reassign"
  | "cancel";

export interface SnapshotStep {
  step_order: number;
  name: string;
  approver_mode: ApproverMode;
  approver_role: string;
  approver_users: string[];
  sla_days: number | null;
  on_reject: OnReject;
}

export interface TemplateSnapshot {
  template: { id: string; name: string; entity_type: "submittal" | "rfi"; project: string };
  steps: SnapshotStep[];
}

export interface WorkflowState {
  status: WorkflowStatus;
  current_step_order: number;
}

/** The fields of a workflow_actions row this logic depends on. */
export interface ActionRecord {
  step_order: number;
  actor: string;
  action: WorkflowActionKind;
  acted_at: string;
}

/** A template as stored, narrowed to what selection needs. */
export interface SelectableTemplate {
  id: string;
  entity_type: "submittal" | "rfi";
  /** Empty string means org-wide. */
  project: string;
  active: boolean;
}

/**
 * Pick the template that governs a new workflow.
 *
 * A project-scoped active template wins over an org-wide one, so a job can
 * override the default without the default being edited. No active template is
 * a normal outcome, not an error: the entity simply behaves as it did before
 * workflows existed.
 */
export function selectTemplate<T extends SelectableTemplate>(
  templates: readonly T[],
  entityType: "submittal" | "rfi",
  projectId: string,
): T | null {
  const usable = templates.filter((t) => t.active && t.entity_type === entityType);
  return (
    usable.find((t) => t.project === projectId) ?? usable.find((t) => t.project === "") ?? null
  );
}

/** Steps in order, defensively — PocketBase returns whatever sort was asked for. */
export function orderedSteps(snapshot: TemplateSnapshot): SnapshotStep[] {
  return [...(snapshot.steps ?? [])].sort((a, b) => a.step_order - b.step_order);
}

export function stepAt(snapshot: TemplateSnapshot, order: number): SnapshotStep | null {
  return orderedSteps(snapshot).find((s) => s.step_order === order) ?? null;
}

export function lastStepOrder(snapshot: TemplateSnapshot): number {
  const steps = orderedSteps(snapshot);
  return steps.length ? steps[steps.length - 1].step_order : 0;
}

/**
 * Who may act on a step.
 *
 * `roleMembers` maps a role name to the user ids holding it on this project —
 * supplied by the caller so this stays pure. An external party recorded in
 * project_roles has no user id and therefore cannot appear here; how they act
 * is still open (docs/project-roles.md).
 */
export function resolveApprovers(
  step: SnapshotStep,
  roleMembers: Readonly<Record<string, string[]>>,
): string[] {
  // Tolerant of partial snapshots: real stored JSON may omit optional fields,
  // and a missing approver list must mean "nobody", never a crash.
  const ids =
    step.approver_mode === "role"
      ? (roleMembers[step.approver_role] ?? [])
      : (step.approver_users ?? []);
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Whether a step is satisfied.
 *
 * The two user modes are not synonyms, and this is the only place the
 * difference shows: `any_of_users` advances on one approval, `specific_users`
 * requires every named approver. If both advanced on one approval the enum
 * would carry no meaning. `role` advances on one approval by any role holder.
 */
export function stepSatisfied(step: SnapshotStep, approvers: readonly string[], approvedBy: ReadonlySet<string>): boolean {
  if (step.approver_mode === "specific_users") {
    return approvers.length > 0 && approvers.every((id) => approvedBy.has(id));
  }
  return approvedBy.size > 0;
}

/** Where a rejection sends the workflow. */
export function afterRejection(step: SnapshotStep, currentOrder: number, snapshot: TemplateSnapshot): WorkflowState {
  switch (step.on_reject) {
    case "terminate":
      return { status: "rejected", current_step_order: currentOrder };
    case "return_to_previous": {
      const orders = orderedSteps(snapshot).map((s) => s.step_order);
      const index = orders.indexOf(currentOrder);
      // Rejecting at the first step has nowhere previous to go, so it behaves
      // as return_to_start rather than falling off the front.
      const target = index > 0 ? orders[index - 1] : (orders[0] ?? 1);
      return { status: "pending", current_step_order: target };
    }
    case "return_to_start":
    default:
      return { status: "pending", current_step_order: orderedSteps(snapshot)[0]?.step_order ?? 1 };
  }
}

/**
 * Replay an instance's action history into the state it implies.
 *
 * This is the reconstruction the audit log exists to make possible: the actions
 * are append-only, so they are the trustworthy record, and any disagreement
 * between this result and the instance's stored status means the status was
 * written without a corresponding action — the forgery gap in docs/STATUS.md.
 *
 * Actions are sorted by `acted_at`; ties keep their given order, which for a
 * PocketBase list sorted by creation is chronological.
 */
export function reconstructState(actions: readonly ActionRecord[], snapshot: TemplateSnapshot): WorkflowState {
  const steps = orderedSteps(snapshot);
  const first = steps[0]?.step_order ?? 1;
  const state: WorkflowState = { status: "pending", current_step_order: first };

  // Approvals only count toward the step they were cast on. Returning to an
  // earlier step clears them, so a re-approval has to be given again.
  let approvedBy = new Set<string>();

  const ordered = [...actions].sort((a, b) => (a.acted_at < b.acted_at ? -1 : a.acted_at > b.acted_at ? 1 : 0));

  for (const action of ordered) {
    if (state.status !== "pending") break; // terminal; nothing after it counts

    if (action.action === "cancel") {
      state.status = "cancelled";
      break;
    }
    // Logged, deliberately inert.
    //
    // `start` records that the workflow opened; it is history, not a
    // transition — replay already begins at the first step, and treating it as
    // one would advance past step 1 before anyone had approved anything. A
    // comment on a step that has moved on is likewise a legitimate record of
    // what someone said, not a state change.
    if (action.action === "start" || action.action === "comment" || action.action === "reassign") {
      continue;
    }
    // An action cast against a step that is no longer current cannot move the
    // workflow — the same guard `act()` enforces at write time.
    if (action.step_order !== state.current_step_order) continue;

    const step = stepAt(snapshot, state.current_step_order);
    if (!step) continue;

    if (action.action === "reject") {
      const next = afterRejection(step, state.current_step_order, snapshot);
      state.status = next.status;
      state.current_step_order = next.current_step_order;
      approvedBy = new Set();
      continue;
    }

    approvedBy.add(action.actor);
    const approvers = resolveApprovers(step, {});
    // For `role` mode the snapshot holds no user ids, so satisfaction cannot be
    // recomputed from the snapshot alone; one approval advances, which matches
    // how act() treats it.
    const satisfied =
      step.approver_mode === "specific_users"
        ? stepSatisfied(step, step.approver_users ?? [], approvedBy)
        : approvers.length === 0 || stepSatisfied(step, approvers, approvedBy);

    if (!satisfied) continue;

    const orders = steps.map((s) => s.step_order);
    const index = orders.indexOf(state.current_step_order);
    if (index === -1 || index === orders.length - 1) {
      state.status = "approved";
    } else {
      state.current_step_order = orders[index + 1];
      approvedBy = new Set();
    }
  }

  return state;
}
