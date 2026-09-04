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
import { deficiencySchema } from "@/lib/validation/deficiency";
import { DEFICIENCY_SEVERITY, DEFICIENCY_STATUS, type Deficiency } from "@/types";

import { deficiencyHooks } from "./DeficiencyClient";

export function DeficiencyDialog({
  projectId,
  open,
  onOpenChange,
  deficiency,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deficiency?: Deficiency | null;
}) {
  const editing = Boolean(deficiency);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = deficiencyHooks.useCreate(projectId);
  const update = deficiencyHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const raw = scalarEntries(form);
    const parsed = (editing ? deficiencySchema.partial() : deficiencySchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    const input = buildPayload(form, parsed.data);

    onOpenChange(false);
    if (editing && deficiency) update.mutate({ id: deficiency.id, input });
    else create.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit deficiency" : "Log deficiency"}</DialogTitle>
          <DialogDescription>
            Life-safety items are stop-work conditions and are highlighted in the log.
          </DialogDescription>
        </DialogHeader>

        <form key={deficiency?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field id="def_number" label="DEF #" error={errors.def_number}>
              <Input id="def_number" name="def_number" placeholder="DEF-043" defaultValue={deficiency?.def_number ?? ""} disabled={pending} />
            </Field>
            <Field id="description" label="Description" error={errors.description}>
              <Input id="description" name="description" defaultValue={deficiency?.description ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="location" label="Location" error={errors.location}>
              <Input id="location" name="location" placeholder="Lvl 2, Corr. B" defaultValue={deficiency?.location ?? ""} disabled={pending} />
            </Field>
            <Field id="trade" label="Trade" error={errors.trade}>
              <Input id="trade" name="trade" placeholder="Bright Electric" defaultValue={deficiency?.trade ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="severity" label="Severity" error={errors.severity}>
              <NativeSelect id="severity" name="severity" defaultValue={deficiency?.severity ?? "major"} disabled={pending} options={DEFICIENCY_SEVERITY} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={deficiency?.status ?? "open"} disabled={pending} options={DEFICIENCY_STATUS} />
            </Field>
            <Field id="code_reference" label="Code ref." error={errors.code_reference}>
              <Input id="code_reference" name="code_reference" placeholder="NEC 300.11" defaultValue={deficiency?.code_reference ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="logged_date" label="Logged" error={errors.logged_date}>
              <Input id="logged_date" name="logged_date" type="date" defaultValue={deficiency?.logged_date ?? ""} disabled={pending} />
            </Field>
            <Field id="due_date" label="Correction due" error={errors.due_date}>
              <Input id="due_date" name="due_date" type="date" defaultValue={deficiency?.due_date ?? ""} disabled={pending} />
            </Field>
            <Field id="closed_date" label="Closed" error={errors.closed_date}>
              <Input id="closed_date" name="closed_date" type="date" defaultValue={deficiency?.closed_date ?? ""} disabled={pending} />
            </Field>
          </div>

          {/* Only meaningful once something has been done about it. */}
          {editing ? (
            <>
              <Field id="corrective_action" label="Corrective action" error={errors.corrective_action}>
                <Textarea id="corrective_action" name="corrective_action" rows={3} defaultValue={deficiency?.corrective_action ?? ""} disabled={pending} />
              </Field>
              <Field id="verified_by" label="Verified by" error={errors.verified_by}>
                <Input id="verified_by" name="verified_by" defaultValue={deficiency?.verified_by ?? ""} disabled={pending} />
              </Field>
            </>
          ) : null}

          <FileField
            collection="deficiencies"
            field="photos"
            label="Photos"
            existing={deficiency?.photos ?? []}
            recordId={deficiency?.id}
            disabled={pending}
            hint="Photograph the deficiency and, once corrected, the correction."
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Log deficiency"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
