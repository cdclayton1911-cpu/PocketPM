import { z } from "zod";

import { PROJECT_ROLE_ROLE } from "@/types";

/**
 * Workflow template validation, kept out of the component on purpose.
 *
 * The conditional shape here — `approver_role` required for `role` mode,
 * `approver_users` otherwise — is a refinement, and refinements are what broke
 * ProjectRoleDialog in fc704da: `.partial()` THROWS on a schema carrying one,
 * killing the submit handler before it sent anything. TypeScript does not catch
 * it, because `.partial` exists on the type and fails only at run time.
 *
 * So the unrefined object is kept separately and the update schema is built
 * from THAT, never from the refined one. `parseStepSubmission` and
 * `parseTemplateSubmission` are the only entry points a component should use.
 */
export const APPROVER_MODES = ["role", "specific_users", "any_of_users"] as const;
export const ON_REJECT_MODES = ["return_to_previous", "return_to_start", "terminate"] as const;

/**
 * UI copy lives beside the schema so the two cannot drift.
 *
 * The two user modes are NOT synonyms — `specific_users` needs every listed
 * approver, `any_of_users` advances on the first — and the engine enforces
 * exactly that (see stepSatisfied in lib/workflow/rules.ts). A label that
 * blurred them would make the difference invisible at the only moment a user
 * picks between them.
 */
export const APPROVER_MODE_LABEL: Record<(typeof APPROVER_MODES)[number], string> = {
  role: "A role on this project",
  specific_users: "Specific people — all must approve",
  any_of_users: "Any one of these people — first to approve advances",
};

export const ON_REJECT_LABEL: Record<(typeof ON_REJECT_MODES)[number], string> = {
  return_to_previous: "Send back one step",
  return_to_start: "Send back to the first step",
  terminate: "End the workflow as rejected",
};

const stepFields = z.object({
  step_order: z.coerce.number().int().min(1),
  name: z.string().trim().min(1, "Give the step a name").max(200),
  approver_mode: z.enum(APPROVER_MODES),
  approver_role: z.string().trim().max(60).optional().default(""),
  approver_users: z.array(z.string().trim().min(1)).optional().default([]),
  // Empty means no SLA. Distinct from 0, which would mean "due immediately".
  sla_days: z.coerce.number().int().min(0).max(365).nullable().optional().default(null),
  on_reject: z.enum(ON_REJECT_MODES),
});

export type WorkflowStepInput = z.infer<typeof stepFields>;

function stepIsRoutable(step: {
  approver_mode: string;
  approver_role?: string;
  approver_users?: string[];
}): boolean {
  return step.approver_mode === "role"
    ? Boolean(step.approver_role)
    : (step.approver_users?.length ?? 0) > 0;
}

export const workflowStepSchema = stepFields.refine(stepIsRoutable, {
  message: "Choose who approves this step",
  // Reported against whichever control the user is actually looking at.
  path: ["approver_role"],
});

const templateFields = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(200),
  entity_type: z.enum(["submittal", "rfi"]),
  /**
   * Required, and frozen after creation by the collection rule
   * (`@request.body.project:isset = false`). Org-wide templates are
   * superuser-only and are never authored here.
   */
  project: z.string().trim().min(1, "Choose the project this template belongs to").max(20),
  active: z.boolean().optional().default(false),
  description: z.string().trim().max(2000).optional().default(""),
  steps: z.array(stepFields).min(1, "A template needs at least one step"),
});

export const workflowTemplateSchema = templateFields.superRefine((value, ctx) => {
  value.steps.forEach((step, index) => {
    if (!stepIsRoutable(step)) {
      ctx.addIssue({
        code: "custom",
        path: ["steps", index, "approver_role"],
        message: "Choose who approves this step",
      });
    }
  });

  const orders = value.steps.map((s) => s.step_order);
  if (new Set(orders).size !== orders.length) {
    // The collection has a unique index on (template, step_order); catching it
    // here turns a constraint violation into a sentence.
    ctx.addIssue({ code: "custom", path: ["steps"], message: "Two steps share a position" });
  }
});

export type WorkflowTemplateInput = z.infer<typeof templateFields>;

/** Roles offered by the role picker — the same set project_roles stores. */
export const APPROVER_ROLES = PROJECT_ROLE_ROLE;

/**
 * Validate one submission from the template editor.
 *
 * `project` is dropped from an edit rather than validated: the collection
 * freezes it, so sending it at all would fail the update rule. The editor does
 * not offer to change it either — this is the second line of defence, not the
 * first.
 */
export function parseTemplateSubmission(raw: unknown, editing: boolean) {
  if (!editing) return workflowTemplateSchema.safeParse(raw);

  // Built from the UNREFINED object. templateFields.omit(...).partial() would
  // throw if templateFields carried the refinement — which is exactly why the
  // refinement lives on workflowTemplateSchema instead.
  const editable = templateFields.omit({ project: true, entity_type: true });
  const parsed = editable.safeParse(raw);
  if (!parsed.success) return parsed;

  const problems = parsed.data.steps.filter((s) => !stepIsRoutable(s));
  if (problems.length > 0) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: "custom" as const,
          path: ["steps", parsed.data.steps.indexOf(problems[0]), "approver_role"],
          message: "Choose who approves this step",
        },
      ]),
    };
  }
  return parsed;
}

/**
 * Only one active template per (entity_type, project).
 *
 * The collection enforces this with a unique partial index; checking here means
 * the user is told before they submit rather than after. Returns the template
 * that would collide, or null.
 */
export function findActiveConflict<T extends { id: string; entity_type: string; project: string; active: boolean }>(
  templates: readonly T[],
  candidate: { id?: string; entity_type: string; project: string; active: boolean },
): T | null {
  if (!candidate.active) return null;
  return (
    templates.find(
      (t) =>
        t.id !== candidate.id &&
        t.active &&
        t.entity_type === candidate.entity_type &&
        t.project === candidate.project,
    ) ?? null
  );
}

/** Renumber steps 1..n after a reorder, so positions are always contiguous. */
export function renumber<T extends { step_order: number }>(steps: readonly T[]): T[] {
  return steps.map((step, index) => ({ ...step, step_order: index + 1 }));
}

/** Move one step within the list. Out-of-range indices are a no-op. */
export function moveStep<T extends { step_order: number }>(steps: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
    return renumber(steps);
  }
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumber(next);
}
