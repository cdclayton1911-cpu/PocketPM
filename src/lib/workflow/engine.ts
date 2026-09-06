// Server-only: every function here talks to PocketBase.
import "server-only";

import type PocketBase from "pocketbase";

import { isPbError } from "@/lib/pocketbase";
import {
  orderedSteps,
  reconstructState,
  resolveApprovers,
  selectTemplate,
  stepAt,
  type ActionRecord,
  type SnapshotStep,
  type TemplateSnapshot,
  type WorkflowActionKind,
} from "@/lib/workflow/rules";

export type EntityType = "submittal" | "rfi";

/**
 * Every function takes the caller's PocketBase client.
 *
 * There is no admin client in this app — `crud-route.ts` and `module-page.ts`
 * both act with the user's token — so the collection rules are the access
 * control here too, not an afterthought layered on top. A function that needed
 * elevated rights would be a design error, not a missing credential.
 */
export interface EngineFailure {
  code: "not_found" | "forbidden" | "conflict" | "stale_step" | "invalid";
  message: string;
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: EngineFailure };

const fail = (code: EngineFailure["code"], message: string): EngineResult<never> => ({
  ok: false,
  error: { code, message },
});

/**
 * The opening entry.
 *
 * Recorded as `start`, its own action kind. It was briefly a `comment`, which
 * replayed correctly only because comments are inert — and made "the workflow
 * began" indistinguishable from someone leaving a note on step 1.
 */
const OPENING_NOTE = "Workflow started";

function collectionFor(entityType: EntityType): "submittals" | "rfis" {
  return entityType === "submittal" ? "submittals" : "rfis";
}

/** Build the frozen copy of a template and its steps. */
function buildSnapshot(
  template: { id: string; name: string; entity_type: EntityType; project?: string },
  steps: readonly Record<string, unknown>[],
): TemplateSnapshot {
  return {
    template: {
      id: template.id,
      name: template.name,
      entity_type: template.entity_type,
      project: template.project ?? "",
    },
    // Deep-copied field by field rather than by reference: the snapshot must
    // not share structure with anything that could later be mutated.
    steps: steps.map((s) => ({
      step_order: Number(s.step_order),
      name: String(s.name ?? ""),
      approver_mode: s.approver_mode as SnapshotStep["approver_mode"],
      approver_role: String(s.approver_role ?? ""),
      approver_users: Array.isArray(s.approver_users) ? [...(s.approver_users as string[])] : [],
      sla_days: s.sla_days == null ? null : Number(s.sla_days),
      on_reject: s.on_reject as SnapshotStep["on_reject"],
    })),
  };
}

export interface WorkflowInstanceRecord {
  id: string;
  project: string;
  submittal: string;
  rfi: string;
  template: string;
  template_snapshot: TemplateSnapshot;
  status: "pending" | "approved" | "rejected" | "cancelled";
  current_step_order: number;
  started_by: string;
}

/**
 * Start a workflow on an entity, if one is configured.
 *
 * Returns `null` when no active template matches: that is the ordinary case for
 * a project that has not configured workflows, and the entity must go on
 * behaving exactly as it did before this feature existed.
 */
export async function startWorkflow(
  pb: PocketBase,
  entityType: EntityType,
  entityId: string,
  actorId: string,
): Promise<EngineResult<WorkflowInstanceRecord | null>> {
  // The entity is re-read as the caller rather than trusted from a request
  // body: it supplies the project used for every scoping decision below, and a
  // client-supplied project would let a caller aim a workflow at someone else's
  // job. A record the caller cannot see 404s here, which is correct.
  let entity: { id: string; project: string };
  try {
    entity = await pb.collection(collectionFor(entityType)).getOne(entityId);
  } catch {
    return fail("not_found", "That record does not exist, or you cannot see it");
  }

  const templates = (await pb.collection("workflow_templates").getFullList({
    filter: pb.filter("entity_type = {:t} && (project = {:p} || project = '')", {
      t: entityType,
      p: entity.project,
    }),
  })) as unknown as { id: string; name: string; entity_type: EntityType; project: string; active: boolean }[];

  const template = selectTemplate(
    templates.map((t) => ({ ...t, project: t.project ?? "", active: Boolean(t.active) })),
    entityType,
    entity.project,
  );
  if (!template) return { ok: true, value: null };

  const steps = await pb.collection("workflow_steps").getFullList({
    filter: pb.filter("template = {:id}", { id: template.id }),
    sort: "step_order",
  });
  if (steps.length === 0) {
    return fail("invalid", `The workflow template "${template.name}" has no steps`);
  }

  const snapshot = buildSnapshot(template, steps);
  const firstOrder = orderedSteps(snapshot)[0].step_order;

  let instance: WorkflowInstanceRecord;
  try {
    instance = await pb.collection("workflow_instances").create({
      project: entity.project,
      submittal: entityType === "submittal" ? entity.id : "",
      rfi: entityType === "rfi" ? entity.id : "",
      template: template.id,
      template_snapshot: snapshot,
      status: "pending",
      current_step_order: firstOrder,
      started_by: actorId,
      started_at: new Date().toISOString(),
    });
  } catch (err) {
    // The unique partial index refuses a second open workflow per entity.
    // Surfaced as a sentence rather than a raw constraint violation.
    const message = JSON.stringify(isPbError(err) ? err.response : {});
    if (message.includes("validation_not_unique")) {
      return fail("conflict", "This record already has a workflow in progress");
    }
    return fail("invalid", "Could not start the workflow");
  }

  await writeAction(pb, instance.id, firstOrder, actorId, "start", OPENING_NOTE);
  return { ok: true, value: instance };
}

/** Append one action row. Never updated or deleted — the rules forbid both. */
async function writeAction(
  pb: PocketBase,
  instanceId: string,
  stepOrder: number,
  actorId: string,
  action: WorkflowActionKind,
  comment: string,
  attachments?: FormData,
): Promise<string> {
  const scalars = {
    instance: instanceId,
    step_order: stepOrder,
    actor: actorId,
    action,
    comment,
    acted_at: new Date().toISOString(),
  };

  if (!attachments) {
    const row = await pb.collection("workflow_actions").create(scalars);
    return row.id;
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(scalars)) form.append(k, String(v));
  for (const file of attachments.getAll("attachments")) form.append("attachments", file);
  const row = await pb.collection("workflow_actions").create(form);
  return row.id;
}

/**
 * Which user ids may act on the instance's current step.
 *
 * Read from the snapshot, never the live template. For `role` mode the role is
 * resolved against project_roles at call time — that lookup is intentionally
 * live, because who holds a role on a project genuinely changes and the
 * snapshot froze the *rule* ("the architect approves"), not the person.
 */
export async function getPendingApprovers(
  pb: PocketBase,
  instance: WorkflowInstanceRecord,
): Promise<string[]> {
  const step = stepAt(instance.template_snapshot, instance.current_step_order);
  if (!step) return [];

  if (step.approver_mode !== "role") return resolveApprovers(step, {});

  const roles = await pb.collection("project_roles").getFullList({
    filter: pb.filter("project = {:p} && role = {:r}", { p: instance.project, r: step.approver_role }),
  });
  const ids = roles.map((r) => String(r.user ?? "")).filter(Boolean);
  return resolveApprovers(step, { [step.approver_role]: ids });
}

export interface ActInput {
  instanceId: string;
  actorId: string;
  action: WorkflowActionKind;
  comment?: string;
  expectedStepOrder: number;
  attachments?: FormData;
}

/**
 * Record an action and apply whatever state it implies.
 *
 * ## Ordering, and why it is this way round
 *
 * The action row is written FIRST, then the instance is updated. The action log
 * is append-only and is the reconstruction source, so an action with no state
 * change is recoverable — replaying the log produces the right answer — while a
 * state change with no action is not: it is indistinguishable from the forgery
 * the audit trail exists to detect.
 *
 * The state change is therefore derived, not computed incrementally: it replays
 * the whole action history through reconstructState. That makes it idempotent
 * on replay for free, and means the stored status can never drift from what the
 * log implies as long as writes go through here.
 */
export async function act(pb: PocketBase, input: ActInput): Promise<EngineResult<WorkflowInstanceRecord>> {
  let instance: WorkflowInstanceRecord;
  try {
    instance = await pb.collection("workflow_instances").getOne(input.instanceId);
  } catch {
    return fail("not_found", "That workflow does not exist, or you cannot see it");
  }

  if (instance.status !== "pending" && input.action !== "comment") {
    return fail("conflict", `This workflow is already ${instance.status}`);
  }

  // The concurrency guard. Two approvers clicking at the same moment both send
  // the step they were looking at; the second one's is stale by the time it
  // lands, and without this it would advance the workflow a second time.
  if (input.action !== "comment" && input.expectedStepOrder !== instance.current_step_order) {
    return fail(
      "stale_step",
      "This step has already moved on. Reload to see where the workflow is now.",
    );
  }

  if (input.action === "cancel") {
    const project = await pb.collection("projects").getOne(instance.project).catch(() => null);
    const isOwner = project?.owner === input.actorId;
    if (instance.started_by !== input.actorId && !isOwner) {
      return fail("forbidden", "Only the person who started this workflow, or the project owner, can cancel it");
    }
  } else if (input.action === "approve" || input.action === "reject") {
    const approvers = await getPendingApprovers(pb, instance);
    if (!approvers.includes(input.actorId)) {
      return fail("forbidden", "You are not an approver for this step");
    }
  }

  await writeAction(
    pb,
    instance.id,
    input.expectedStepOrder,
    input.actorId,
    input.action,
    input.comment ?? "",
    input.attachments,
  );

  const actions = (await pb.collection("workflow_actions").getFullList({
    filter: pb.filter("instance = {:id}", { id: instance.id }),
    sort: "acted_at",
  })) as unknown as ActionRecord[];

  const next = reconstructState(actions, instance.template_snapshot);
  if (next.status === instance.status && next.current_step_order === instance.current_step_order) {
    return { ok: true, value: instance };
  }

  const patch: Record<string, unknown> = {
    status: next.status,
    current_step_order: next.current_step_order,
  };
  if (next.status !== "pending") patch.completed_at = new Date().toISOString();

  const updated = (await pb
    .collection("workflow_instances")
    .update(instance.id, patch)) as unknown as WorkflowInstanceRecord;

  if (next.status === "approved" || next.status === "rejected") {
    await applyRevisionOutcome(pb, updated, next.status);
  }

  return { ok: true, value: updated };
}

/**
 * A completed workflow moves the entity's current revision.
 *
 * One direction only, as decided: the workflow closing causes the revision
 * transition, never the reverse. document_revisions.updateRule keeps owning
 * field immutability and is not touched — that rule already permits a status
 * change on an issued revision, since it only freezes file, revision_number,
 * issued_at and the stamp fields.
 *
 * Best-effort by design: the workflow's own outcome is already durably
 * recorded, and failing the whole request because a downstream status did not
 * move would leave the caller unable to retry a workflow that has, in fact,
 * completed.
 */
async function applyRevisionOutcome(
  pb: PocketBase,
  instance: WorkflowInstanceRecord,
  outcome: "approved" | "rejected",
): Promise<void> {
  const field = instance.submittal ? "submittal" : "rfi";
  const entityId = instance.submittal || instance.rfi;
  if (!entityId) return;

  try {
    const revisions = await pb.collection("document_revisions").getFullList({
      filter: pb.filter(`${field} = {:id} && is_current = true`, { id: entityId }),
    });
    for (const rev of revisions) {
      if (rev.status === "approved" || rev.status === "rejected") continue; // already settled
      await pb.collection("document_revisions").update(rev.id, { status: outcome });
    }
  } catch {
    // Swallowed deliberately — see the note above.
  }
}
