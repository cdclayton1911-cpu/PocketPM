"use client";

import { CheckCircle2, Download, FileText, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { FileField } from "@/components/shared/FileField";
import { Field } from "@/components/shared/FormField";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  nextRevisionNumber,
  useCreateRevision,
  useIssueRevision,
  useRevisions,
  useUpdateRevision,
  type ParentType,
} from "@/hooks/useRevisions";
import type { DocumentRevision, DocumentRevisionStatus } from "@/types";

const TONE: Record<DocumentRevisionStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  superseded: "neutral",
};

/**
 * Revision history for one submittal or RFI.
 *
 * The whole point of this module: a submittal is not a status field, it is Rev 0
 * rejected and Rev 1 approved, each a stamped document with its own dates. So
 * the history is the primary view and the "add" form sits underneath it.
 *
 * Every rule shown here is enforced by PocketBase, not by this component —
 * disabled buttons are a courtesy, not the boundary. See docs/revisions.md.
 */
export function RevisionsDialog({
  parentType,
  parentId,
  parentLabel,
  open,
  onOpenChange,
}: {
  parentType: ParentType;
  parentId: string;
  parentLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useRevisions(parentType, parentId);
  const create = useCreateRevision(parentType, parentId);
  const issue = useIssueRevision(parentType, parentId);
  const update = useUpdateRevision(parentType, parentId);
  const [adding, setAdding] = useState(false);

  const revisions = query.data ?? [];
  const current = revisions.find((r) => r.is_current);
  const pending = create.isPending || issue.isPending || update.isPending;

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("revision_number", String(nextRevisionNumber(revisions)));
    create.mutate(form, { onSuccess: () => setAdding(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Revisions — {parentLabel}</DialogTitle>
          <DialogDescription>
            Each revision is a separate stamped document. Once issued it is frozen; a correction
            is a new revision, never an edit.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-r6 bg-secondary" />
            ))}
          </div>
        ) : query.isError ? (
          <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
            {query.error instanceof Error ? query.error.message : "Could not load revisions."}
          </p>
        ) : revisions.length === 0 ? (
          <p className="rounded-r6 border bg-secondary/40 px-3 py-4 text-center text-[13px] text-muted-foreground">
            No revisions yet. Rev 0 is the first issue.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {revisions.map((rev) => (
              <RevisionRow
                key={rev.id}
                rev={rev}
                isCurrent={rev.id === current?.id}
                pending={pending}
                onIssue={() => issue.mutate({ revision: rev, current, issuedBy: "" })}
                onDecide={(status) => update.mutate({ id: rev.id, input: { status } })}
              />
            ))}
          </ul>
        )}

        {adding ? (
          <form onSubmit={onAdd} className="flex flex-col gap-3 rounded-r8 border p-3">
            <p className="text-[13px] font-semibold">
              New revision — Rev {nextRevisionNumber(revisions)}
            </p>
            <FileField
              collection="document_revisions"
              field="file"
              label="Revision document"
              disabled={create.isPending}
              hint="The stamped PDF for this revision. One file, up to 100 MB."
            />
            <div className="grid grid-cols-2 gap-3">
              <Field id="rev-stamped-by" label="Stamped by">
                <Input id="rev-stamped-by" name="stamped_by" disabled={create.isPending} />
              </Field>
              <Field id="rev-due" label="Review due">
                <Input id="rev-due" name="review_due_at" type="date" disabled={create.isPending} />
              </Field>
            </div>
            <Field id="rev-notes" label="Notes">
              <Textarea id="rev-notes" name="notes" rows={2} disabled={create.isPending} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={pending}>
            Add Rev {nextRevisionNumber(revisions)}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevisionRow({
  rev,
  isCurrent,
  pending,
  onIssue,
  onDecide,
}: {
  rev: DocumentRevision;
  isCurrent: boolean;
  pending: boolean;
  onIssue: () => void;
  onDecide: (status: DocumentRevisionStatus) => void;
}) {
  const isDraft = rev.status === "draft";
  return (
    <li className="flex flex-col gap-2 rounded-r8 border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold">Rev {rev.revision_number}</span>
        <StatusBadge tone={TONE[rev.status] ?? "neutral"}>{rev.status}</StatusBadge>
        {isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : null}
        <span className="flex-1" />
        {rev.file ? (
          <a
            href={`/api/files/document_revisions/${rev.id}/${encodeURIComponent(rev.file)}`}
            className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
          >
            <Download className="size-3.5" aria-hidden /> PDF
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
            <FileText className="size-3.5" aria-hidden /> No file
          </span>
        )}
      </div>

      <p className="text-[12px] text-muted-foreground">
        {rev.issued_at ? `Issued ${rev.issued_at}` : "Not issued"}
        {rev.stamped_by ? ` · stamped by ${rev.stamped_by}` : ""}
        {rev.review_due_at ? ` · review due ${rev.review_due_at}` : ""}
      </p>
      {rev.notes ? <p className="text-[12px]">{rev.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        {isDraft ? (
          <Button size="sm" className="h-7 text-xs" onClick={onIssue} disabled={pending}>
            Issue Rev {rev.revision_number}
          </Button>
        ) : null}
        {rev.status === "submitted" ? (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDecide("approved")} disabled={pending}>
              <CheckCircle2 className="size-3.5" aria-hidden /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDecide("rejected")} disabled={pending}>
              <XCircle className="size-3.5" aria-hidden /> Reject
            </Button>
          </>
        ) : null}
        {rev.status === "rejected" ? (
          <p className="text-[12px] text-muted-foreground">
            Rejected. Add the next revision rather than editing this one.
          </p>
        ) : null}
      </div>
    </li>
  );
}
