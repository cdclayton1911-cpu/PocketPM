"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/enum-labels";
import {
  APPROVER_MODES,
  APPROVER_MODE_LABEL,
  APPROVER_ROLES,
  ON_REJECT_LABEL,
  ON_REJECT_MODES,
  moveStep,
  type WorkflowStepInput,
} from "@/lib/validation/workflow-template";

export interface Member {
  id: string;
  name: string;
}

/**
 * Drag-to-reorder without a drag-and-drop library.
 *
 * "No new dependencies" rules out dnd-kit, so this is the HTML5 drag API. The
 * buttons beside the handle do the same job from the keyboard — a pointer-only
 * reorder would make step order unreachable for anyone not using a mouse.
 */
export function StepEditor({
  steps,
  members,
  onChange,
  errors,
  disabled,
}: {
  steps: WorkflowStepInput[];
  members: Member[];
  onChange: (next: WorkflowStepInput[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function update(index: number, patch: Partial<WorkflowStepInput>) {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div
          key={index}
          draggable={!disabled}
          onDragStart={() => setDragging(index)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(index);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null) onChange(moveStep(steps, dragging, index));
            setDragging(null);
            setOver(null);
          }}
          className={cn(
            "rounded border border-neutral-200 p-3",
            over === index && dragging !== null && dragging !== index && "border-sky-400 bg-sky-50",
            dragging === index && "opacity-50",
          )}
        >
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center pt-1">
              <GripVertical className="size-4 cursor-grab text-neutral-400" aria-hidden />
              <button
                type="button"
                aria-label={`Move step ${index + 1} up`}
                disabled={disabled || index === 0}
                onClick={() => onChange(moveStep(steps, index, index - 1))}
                className="text-[10px] text-neutral-500 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move step ${index + 1} down`}
                disabled={disabled || index === steps.length - 1}
                onClick={() => onChange(moveStep(steps, index, index + 1))}
                className="text-[10px] text-neutral-500 disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`step-name-${index}`}>Step {index + 1}</Label>
                <Input
                  id={`step-name-${index}`}
                  value={step.name}
                  disabled={disabled}
                  placeholder="Architect review"
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor={`step-mode-${index}`}>Who approves</Label>
                <select
                  id={`step-mode-${index}`}
                  className="h-9 w-full rounded border border-neutral-300 px-2 text-[13px]"
                  value={step.approver_mode}
                  disabled={disabled}
                  onChange={(e) =>
                    update(index, {
                      approver_mode: e.target.value as WorkflowStepInput["approver_mode"],
                      // Cleared on switch so a stale role cannot satisfy a user
                      // step, or vice versa, once the other control is hidden.
                      approver_role: "",
                      approver_users: [],
                    })
                  }
                >
                  {APPROVER_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {APPROVER_MODE_LABEL[mode]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {step.approver_mode === "role" ? (
                  <>
                    <Label htmlFor={`step-role-${index}`}>Role</Label>
                    <select
                      id={`step-role-${index}`}
                      className="h-9 w-full rounded border border-neutral-300 px-2 text-[13px]"
                      value={step.approver_role}
                      disabled={disabled}
                      onChange={(e) => update(index, { approver_role: e.target.value })}
                    >
                      <option value="">Choose a role…</option>
                      {APPROVER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <Label htmlFor={`step-users-${index}`}>People</Label>
                    <select
                      id={`step-users-${index}`}
                      multiple
                      className="min-h-[72px] w-full rounded border border-neutral-300 px-2 py-1 text-[13px]"
                      value={step.approver_users}
                      disabled={disabled}
                      onChange={(e) =>
                        update(index, {
                          approver_users: Array.from(e.target.selectedOptions, (o) => o.value),
                        })
                      }
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {errors[`steps.${index}.approver_role`] ? (
                  <p className="mt-1 text-[11px] text-red-600">{errors[`steps.${index}.approver_role`]}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor={`step-sla-${index}`}>SLA days (optional)</Label>
                <Input
                  id={`step-sla-${index}`}
                  type="number"
                  min={0}
                  value={step.sla_days ?? ""}
                  disabled={disabled}
                  // Empty means no SLA. Coercing it to 0 would mark the step
                  // overdue the moment it opened.
                  onChange={(e) =>
                    update(index, { sla_days: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <Label htmlFor={`step-reject-${index}`}>If rejected</Label>
                <select
                  id={`step-reject-${index}`}
                  className="h-9 w-full rounded border border-neutral-300 px-2 text-[13px]"
                  value={step.on_reject}
                  disabled={disabled}
                  onChange={(e) =>
                    update(index, { on_reject: e.target.value as WorkflowStepInput["on_reject"] })
                  }
                >
                  {ON_REJECT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {ON_REJECT_LABEL[mode]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove step ${index + 1}`}
              disabled={disabled || steps.length === 1}
              onClick={() => onChange(moveStep(steps.filter((_, i) => i !== index), 0, 0))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      {errors.steps ? <p className="text-[11px] text-red-600">{errors.steps}</p> : null}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...steps,
            {
              step_order: steps.length + 1,
              name: "",
              approver_mode: "role",
              approver_role: "",
              approver_users: [],
              sla_days: null,
              on_reject: "return_to_start",
            },
          ])
        }
      >
        Add a step
      </Button>
    </div>
  );
}
