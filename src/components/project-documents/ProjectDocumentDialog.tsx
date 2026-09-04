"use client";

import { useState, type FormEvent } from "react";

import { buildPayload, FileField, scalarEntries } from "@/components/shared/FileField";
import { Field, NativeSelect } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { projectDocumentSchema } from "@/lib/validation/project-document";
import { CATEGORY_LABEL } from "@/lib/enum-labels";
import { PROJECT_DOCUMENT_CATEGORY, type ProjectDocument } from "@/types";

import { projectDocumentHooks } from "./ProjectDocumentsClient";

/**
 * File a project-level document.
 *
 * The attach control is present on create *and* edit here, unlike submittals —
 * a project document has no revision chain, so replacing a wrongly-uploaded
 * file is an ordinary correction rather than a rewrite of evidence.
 */
export function ProjectDocumentDialog({
  projectId,
  open,
  onOpenChange,
  doc,
  supersedeCandidates,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc?: ProjectDocument | null;
  supersedeCandidates: ProjectDocument[];
}) {
  const editing = Boolean(doc);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = projectDocumentHooks.useCreate(projectId);
  const update = projectDocumentHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const raw = scalarEntries(form);
    // An unchecked checkbox submits nothing at all, so the absence has to be
    // made explicit or a partial update would silently leave the old value.
    raw.is_current = form.get("is_current") ? "true" : "";

    const parsed = (editing ? projectDocumentSchema.partial() : projectDocumentSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    const input = buildPayload(form, parsed.data);
    onOpenChange(false);
    if (editing && doc) update.mutate({ id: doc.id, input });
    else create.mutate(input);
  }

  const others = supersedeCandidates.filter((d) => d.id !== doc?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit document" : "File a document"}</DialogTitle>
          <DialogDescription>
            Contracts, specifications, geotech reports, permits — anything that belongs to the
            project rather than to one submittal or RFI.
          </DialogDescription>
        </DialogHeader>

        <form key={doc?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[1fr_180px] gap-3">
            <Field id="title" label="Title" error={errors.title}>
              <Input id="title" name="title" placeholder="Owner–Contractor Agreement" defaultValue={doc?.title ?? ""} disabled={pending} />
            </Field>
            <Field id="category" label="Category" error={errors.category}>
              <NativeSelect
                id="category"
                name="category"
                labels={CATEGORY_LABEL}
                defaultValue={doc?.category ?? "contract"}
                disabled={pending}
                options={PROJECT_DOCUMENT_CATEGORY}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="doc_number" label="Document number" error={errors.doc_number}>
              <Input id="doc_number" name="doc_number" placeholder="A101 / 03 30 00" defaultValue={doc?.doc_number ?? ""} disabled={pending} />
            </Field>
            <Field id="revision" label="Revision" error={errors.revision}>
              <Input id="revision" name="revision" placeholder="Conformed / Addendum 2" defaultValue={doc?.revision ?? ""} disabled={pending} />
            </Field>
            <Field id="issued_by" label="Issued by" error={errors.issued_by}>
              <Input id="issued_by" name="issued_by" placeholder="Architect / AHJ" defaultValue={doc?.issued_by ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="issued_date" label="Issued" error={errors.issued_date}>
              <Input id="issued_date" name="issued_date" type="date" defaultValue={doc?.issued_date ?? ""} disabled={pending} />
            </Field>
            <Field id="received_date" label="Received" error={errors.received_date}>
              <Input id="received_date" name="received_date" type="date" defaultValue={doc?.received_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <FileField
            collection="project_documents"
            field="file"
            label="Document"
            existing={doc?.file ? [doc.file] : []}
            recordId={doc?.id}
            disabled={pending}
            hint="One file, up to 100 MB."
          />

          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="is_current"
              className="size-3.5 accent-primary"
              defaultChecked={doc ? doc.is_current : true}
              disabled={pending}
            />
            This is the current version in force
          </label>

          {editing && others.length > 0 ? (
            <Field id="superseded_by" label="Superseded by" error={errors.superseded_by}>
              {/* Marking the replacement is what stops someone building off an
                  out-of-date spec — the failure this flag exists to prevent. */}
              <NativeSelect
                id="superseded_by"
                name="superseded_by"
                humanize={false}
                defaultValue={doc?.superseded_by ?? ""}
                disabled={pending}
                options={["", ...others.map((d) => d.id)]}
                labels={{ "": "Not superseded", ...Object.fromEntries(others.map((d) => [d.id, d.title])) }}
              />
            </Field>
          ) : null}

          <Field id="notes" label="Notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={2} defaultValue={doc?.notes ?? ""} disabled={pending} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "File document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
