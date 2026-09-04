"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FileField, scalarEntries } from "@/components/shared/FileField";
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
import { createInitialRevision } from "@/hooks/useRevisions";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { submittalSchema } from "@/lib/validation/submittal";
import { SUBMITTAL_DISPOSITION, SUBMITTAL_TYPE, type Submittal } from "@/types";

import { submittalHooks } from "./SubmittalsClient";

export function SubmittalDialog({
  projectId,
  open,
  onOpenChange,
  submittal,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submittal?: Submittal | null;
}) {
  const editing = Boolean(submittal);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = submittalHooks.useCreate(projectId);
  const update = submittalHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const initialFile = form.get("file");
    const raw = scalarEntries(form);
    const parsed = (editing ? submittalSchema.partial() : submittalSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    // Closes immediately: the mutation is optimistic, and a failure rolls the
    // row back and raises a toast.
    onOpenChange(false);
    if (editing && submittal) update.mutate({ id: submittal.id, input: parsed.data });
    else
      create.mutate(parsed.data, {
        onSuccess: (record) => {
          // The parent exists now, so the revision has something to hang off.
          if (!(initialFile instanceof File) || initialFile.size === 0) return;
          void createInitialRevision("submittal", record.id, initialFile).catch(() =>
            toast.error(
              "Saved, but the file did not upload. Add it from History on the row.",
            ),
          );
        },
      });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit submittal" : "New submittal"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this submittal." : "Log a submittal for A/E review."}
          </DialogDescription>
        </DialogHeader>

        <form key={submittal?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field id="submittal_number" label="Submittal #" error={errors.submittal_number}>
              <Input id="submittal_number" name="submittal_number" placeholder="035-A" defaultValue={submittal?.submittal_number ?? ""} disabled={pending} />
            </Field>
            <Field id="spec_section" label="Spec section" error={errors.spec_section}>
              <Input id="spec_section" name="spec_section" placeholder="08 71 00" defaultValue={submittal?.spec_section ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="description" label="Description" error={errors.description}>
            <Input id="description" name="description" defaultValue={submittal?.description ?? ""} disabled={pending} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="type" label="Type" error={errors.type}>
              <NativeSelect id="type" name="type" defaultValue={submittal?.type ?? "shop_drawing"} disabled={pending} options={SUBMITTAL_TYPE} />
            </Field>
            <Field id="disposition" label="Disposition" error={errors.disposition}>
              <NativeSelect id="disposition" name="disposition" defaultValue={submittal?.disposition ?? "pending"} disabled={pending} options={SUBMITTAL_DISPOSITION} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="submitted_date" label="Submitted" error={errors.submitted_date}>
              <Input id="submitted_date" name="submitted_date" type="date" defaultValue={submittal?.submitted_date ?? ""} disabled={pending} />
            </Field>
            <Field id="ae_due_date" label="A/E due" error={errors.ae_due_date}>
              <Input id="ae_due_date" name="ae_due_date" type="date" defaultValue={submittal?.ae_due_date ?? ""} disabled={pending} />
            </Field>
            <Field id="revision" label="Revision" error={errors.revision}>
              <Input id="revision" name="revision" defaultValue={submittal?.revision ?? ""} disabled={pending} />
            </Field>
          </div>

          {/* Create only. On edit the document belongs to a revision, so
              History is the honest place to manage it — an attach box here
              would imply it replaces the current revision, which it must not. */}
          {editing ? null : (
            <FileField
              collection="document_revisions"
              field="file"
              label="Shop drawing / product data (PDF)"
              disabled={pending}
              hint="Attached as Rev 0. Later revisions go through History on the row."
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Log submittal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
