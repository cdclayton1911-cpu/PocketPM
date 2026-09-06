"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDashed, Clock, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FileField } from "@/components/shared/FileField";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SnapshotStep, TemplateSnapshot } from "@/lib/workflow/rules";

interface ActionRow {
  id: string;
  step_order: number;
  actor: string;
  action: "start" | "approve" | "reject" | "comment" | "reassign" | "cancel";
  comment: string;
  attachments: string[];
  acted_at: string;
  collectionId: string;
  expand?: { actor?: { id: string; name?: string; email?: string } };
}

interface InstanceRow {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  current_step_order: number;
  template_snapshot: TemplateSnapshot;
  started_by: string;
}

interface Payload {
  instance: InstanceRow | null;
  approvers: string[];
  actions: ActionRow[];
}

function actorName(row: ActionRow): string {
  return row.expand?.actor?.name || row.expand?.actor?.email || "Someone";
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ApprovalPanel({
  entityType,
  entityId,
  currentUserId,
}: {
  entityType: "submittal" | "rfi";
  entityId: string;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const key = ["workflow-instance", entityType, entityId];
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery<Payload>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/workflow/instance?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) throw new Error("Could not load the approval workflow");
      return res.json();
    },
  });

  const act = useMutation({
    mutationFn: async (vars: { action: "approve" | "reject" | "comment"; form: HTMLFormElement | null }) => {
      const instance = query.data?.instance;
      if (!instance) throw new Error("No workflow loaded");

      const body = new FormData();
      body.append("instanceId", instance.id);
      body.append("action", vars.action);
      body.append("comment", comment);
      // Sent from the instance as loaded, so a step that moved under us is
      // detected by the server rather than silently double-advanced.
      body.append("expectedStepOrder", String(instance.current_step_order));
      if (vars.form) {
        for (const file of new FormData(vars.form).getAll("attachments")) {
          if (file instanceof File && file.size > 0) body.append("attachments", file);
        }
      }

      const res = await fetch("/api/workflow/act", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.errors?.form ?? "Could not record that") as Error & { code?: string };
        err.code = data?.code;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      setComment("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: Error & { code?: string }) => {
      // A stale step is not a generic failure — someone else acted first, and
      // the only useful response is to show the user where the workflow now is.
      if (err.code === "stale_step") {
        setError("This step was already actioned by someone else. The panel has been refreshed.");
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      setError(err.message);
      toast.error(err.message);
    },
  });

  // No workflow is the ordinary state for a project with no active template.
  // Rendering an empty shell would imply something is missing.
  if (query.isLoading || !query.data?.instance) return null;

  const { instance, approvers, actions } = query.data;
  const steps = [...(instance.template_snapshot.steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const canAct = instance.status === "pending" && approvers.includes(currentUserId);

  // `start` is history, not a step. Rendering it in the stepper would show a
  // completed step nobody approved.
  const history = actions.filter((a) => a.action === "start");
  const stepActions = actions.filter((a) => a.action !== "start");

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Approval workflow</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            instance.status === "approved" && "bg-emerald-100 text-emerald-800",
            instance.status === "rejected" && "bg-red-100 text-red-800",
            instance.status === "cancelled" && "bg-neutral-200 text-neutral-700",
            instance.status === "pending" && "bg-sky-100 text-sky-800",
          )}
        >
          {instance.status}
        </span>
      </div>

      <p className="mb-3 text-[11px] text-neutral-500">
        {instance.template_snapshot.template?.name}
        {history.length > 0 ? ` · started ${when(history[0].acted_at)} by ${actorName(history[0])}` : null}
      </p>

      <ol className="space-y-3">
        {steps.map((step) => {
          const state =
            instance.status !== "pending" && step.step_order >= instance.current_step_order
              ? instance.status === "approved"
                ? "done"
                : "stopped"
              : step.step_order < instance.current_step_order
                ? "done"
                : step.step_order === instance.current_step_order
                  ? "current"
                  : "upcoming";

          const onThisStep = stepActions.filter((a) => a.step_order === step.step_order);
          return (
            <li key={step.step_order} className="flex gap-3">
              <StepIcon state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-[13px]", state === "upcoming" && "text-neutral-400")}>{step.name}</span>
                  {step.sla_days != null ? (
                    <span className="text-[11px] text-neutral-400">{step.sla_days}d SLA</span>
                  ) : null}
                </div>

                {state === "current" ? <PendingApprovers step={step} onThisStep={onThisStep} /> : null}

                {onThisStep.map((a) => (
                  <div key={a.id} className="mt-1 rounded border border-neutral-200 px-2 py-1 text-[12px]">
                    <div className="text-neutral-600">
                      <span className="font-medium">{actorName(a)}</span> {a.action} · {when(a.acted_at)}
                    </div>
                    {a.comment ? <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{a.comment}</p> : null}
                    {(a.attachments ?? []).map((file) => (
                      <a
                        key={file}
                        href={`/api/files/workflow_actions/${a.id}/${encodeURIComponent(file)}`}
                        className="mt-0.5 block truncate text-sky-700 underline"
                      >
                        {file}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {error ? <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-900">{error}</p> : null}

      {canAct ? (
        <form
          className="mt-4 border-t border-neutral-200 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <Textarea
            rows={2}
            value={comment}
            placeholder="Comment (required to reject)"
            onChange={(e) => setComment(e.target.value)}
            disabled={act.isPending}
          />
          <div className="mt-2">
            <FileField field="attachments" collection="workflow_actions" label="Attachments" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              disabled={act.isPending}
              onClick={(e) => act.mutate({ action: "approve", form: e.currentTarget.form })}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={act.isPending}
              onClick={(e) => {
                // Enforced here as well as read by a human: a rejection with no
                // reason is unactionable by whoever has to fix it.
                if (!comment.trim()) {
                  setError("Say why you are rejecting this — the next person needs the reason.");
                  return;
                }
                act.mutate({ action: "reject", form: e.currentTarget.form });
              }}
            >
              Reject
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function StepIcon({ state }: { state: "done" | "current" | "upcoming" | "stopped" }) {
  const className = "mt-0.5 size-4 shrink-0";
  if (state === "done") return <Check className={cn(className, "text-emerald-600")} />;
  if (state === "stopped") return <X className={cn(className, "text-red-600")} />;
  if (state === "current") return <Clock className={cn(className, "text-sky-600")} />;
  return <CircleDashed className={cn(className, "text-neutral-300")} />;
}

/**
 * For a step needing every named approver, who is still outstanding.
 *
 * Only meaningful for `specific_users`: the other modes advance on the first
 * approval, so "waiting on" would be misleading — nobody in particular is
 * holding it up.
 */
function PendingApprovers({ step, onThisStep }: { step: SnapshotStep; onThisStep: ActionRow[] }) {
  if (step.approver_mode !== "specific_users") return null;
  const approved = new Set(onThisStep.filter((a) => a.action === "approve").map((a) => a.actor));
  const outstanding = (step.approver_users ?? []).filter((id) => !approved.has(id));
  if (outstanding.length === 0) return null;
  return (
    <p className="text-[11px] text-neutral-500">
      {approved.size} of {step.approver_users.length} approved · all must approve
    </p>
  );
}
