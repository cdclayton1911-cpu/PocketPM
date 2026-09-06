"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import {
  findActiveConflict,
  parseTemplateSubmission,
  renumber,
  type WorkflowStepInput,
} from "@/lib/validation/workflow-template";
import { StepEditor, type Member } from "./StepEditor";

interface TemplateRow {
  id: string;
  name: string;
  entity_type: "submittal" | "rfi";
  project: string;
  active: boolean;
  description: string;
  steps: (WorkflowStepInput & { id: string })[];
}

const BLANK_STEP: WorkflowStepInput = {
  step_order: 1,
  name: "",
  approver_mode: "role",
  approver_role: "",
  approver_users: [],
  sla_days: null,
  on_reject: "return_to_start",
};

export function WorkflowSettingsClient({
  projectId,
  projectName,
  isOwner,
  members,
}: {
  projectId: string;
  projectName: string;
  /** Only a project's owner may author its templates — the collection rule. */
  isOwner: boolean;
  members: Member[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [draft, setDraft] = useState<null | {
    id?: string;
    name: string;
    entity_type: "submittal" | "rfi";
    active: boolean;
    description: string;
    steps: WorkflowStepInput[];
  }>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const query = useQuery<{ items: TemplateRow[] }>({
    queryKey: ["workflow-templates"],
    queryFn: async () => {
      const res = await fetch("/api/workflow/templates");
      if (!res.ok) throw new Error("Could not load workflow templates");
      return res.json();
    },
  });

  const templates = query.data?.items ?? [];

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown> & { id?: string }) => {
      const { id, ...payload } = body;
      const res = await fetch(id ? `/api/workflow/templates/${id}` : "/api/workflow/templates", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.form ?? "Could not save the template");
      return data;
    },
    onSuccess: () => {
      setDraft(null);
      setEditing(null);
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
      toast.success("Template saved. Workflows already running are unaffected.");
    },
    // Surfaced verbatim: the server may refuse for a reason the client cannot
    // predict — the unique active index, or ownership.
    onError: (err: Error) => setErrors({ form: err.message }),
  });

  function submit() {
    if (!draft) return;
    setErrors({});

    const conflict = findActiveConflict(
      templates.map((t) => ({ ...t })),
      { id: draft.id, entity_type: draft.entity_type, project: projectId, active: draft.active },
    );
    if (conflict) {
      setErrors({
        form: `"${conflict.name}" is already the active ${draft.entity_type} workflow for this project. Deactivate it first.`,
      });
      return;
    }

    const payload = { ...draft, project: projectId, steps: renumber(draft.steps) };
    const parsed = parseTemplateSubmission(payload, Boolean(draft.id));
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    save.mutate({ ...(parsed.data as Record<string, unknown>), id: draft.id });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold">Approval workflows</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          Templates for {projectName}. Editing a template only affects workflows started afterwards —
          each running workflow keeps a frozen copy of the steps it began with.
        </p>
      </div>

      {!isOwner ? (
        <p className="rounded bg-neutral-100 px-3 py-2 text-[12px] text-neutral-600">
          Only the owner of this project can create or change its workflow templates. You can see
          them here.
        </p>
      ) : null}

      {(["submittal", "rfi"] as const).map((entityType) => {
        const forType = templates.filter((t) => t.entity_type === entityType);
        return (
          <Card key={entityType} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold capitalize">{entityType} workflows</h2>
              {isOwner ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setErrors({});
                    setDraft({
                      name: "",
                      entity_type: entityType,
                      active: false,
                      description: "",
                      steps: [{ ...BLANK_STEP }],
                    });
                  }}
                >
                  New template
                </Button>
              ) : null}
            </div>

            {forType.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description={`New ${entityType}s will not start a workflow until an active template exists.`}
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {forType.map((template) => {
                  // project = "" is org-wide: superuser-only, so it is shown
                  // read-only rather than offering an edit that would 403.
                  const orgWide = !template.project;
                  const editable = isOwner && !orgWide && template.project === projectId;
                  return (
                    <li key={template.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px]">{template.name}</span>
                          {template.active ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">
                              active
                            </span>
                          ) : (
                            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600">
                              inactive
                            </span>
                          )}
                          {orgWide ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500">
                              <Lock className="size-3" /> organisation default
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          {template.steps.length} step{template.steps.length === 1 ? "" : "s"}
                          {orgWide
                            ? " · applies to every project; only an administrator can change it"
                            : null}
                        </p>
                      </div>
                      {editable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditing(template);
                            setErrors({});
                            setDraft({
                              id: template.id,
                              name: template.name,
                              entity_type: template.entity_type,
                              active: template.active,
                              description: template.description,
                              steps: template.steps.length
                                ? template.steps.map(({ ...s }) => s)
                                : [{ ...BLANK_STEP }],
                            });
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}

      {draft ? (
        <Card className="p-4">
          <h2 className="mb-2 text-[13px] font-semibold">
            {editing ? `Edit ${editing.name}` : `New ${draft.entity_type} workflow`}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Standard submittal review"
              />
              {errors.name ? <p className="mt-1 text-[11px] text-red-600">{errors.name}</p> : null}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <p className="text-[11px] text-neutral-500">
                Project: <span className="text-neutral-800">{projectName}</span>
                {" — "}
                {editing
                  ? "a template cannot be moved to another project once created; make a new one there instead."
                  : "chosen at creation and fixed afterwards."}
              </p>
            </div>

            <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
              <Checkbox
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
              />
              Active — new {draft.entity_type}s in this project start this workflow
            </label>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Steps</h3>
            <StepEditor
              steps={draft.steps}
              members={members}
              errors={errors}
              disabled={save.isPending}
              onChange={(steps) => setDraft({ ...draft, steps })}
            />
          </div>

          {errors.form ? (
            <p className="mt-3 rounded bg-red-50 px-2 py-1 text-[12px] text-red-800">{errors.form}</p>
          ) : null}

          <p className="mt-3 text-[11px] text-neutral-500">
            Saving affects new workflows only. Anything already in progress keeps the steps it
            started with.
          </p>

          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
