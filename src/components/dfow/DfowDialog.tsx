"use client";

import { useState, type FormEvent } from "react";

import { dropEmptyNumbers, Field, NativeSelect } from "@/components/shared/FormField";
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
import { dfowSchema } from "@/lib/validation/dfow";
import { DFOW_PHASE, type Dfow } from "@/types";

import { dfowHooks } from "./DfowClient";

export function DfowDialog({
  projectId,
  open,
  onOpenChange,
  dfow,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dfow?: Dfow | null;
}) {
  const editing = Boolean(dfow);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = dfowHooks.useCreate(projectId);
  const update = dfowHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      ["score"],
    );
    const parsed = (editing ? dfowSchema.partial() : dfowSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    onOpenChange(false);
    if (editing && dfow) update.mutate({ id: dfow.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit DFOW" : "Add DFOW"}</DialogTitle>
          <DialogDescription>
            A definable feature of work runs through preparatory, initial, and follow-up phases
            before it can be covered or concealed.
          </DialogDescription>
        </DialogHeader>

        <form key={dfow?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field id="dfow_number" label="DFOW #" error={errors.dfow_number}>
              <Input id="dfow_number" name="dfow_number" placeholder="DFOW-004" defaultValue={dfow?.dfow_number ?? ""} disabled={pending} />
            </Field>
            <Field id="name" label="Feature of work" error={errors.name}>
              <Input id="name" name="name" placeholder="MEP Rough-In — Level 2" defaultValue={dfow?.name ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="spec_sections" label="Spec section(s)" error={errors.spec_sections}>
              <Input id="spec_sections" name="spec_sections" placeholder="23 31 13 / 26 05 00" defaultValue={dfow?.spec_sections ?? ""} disabled={pending} />
            </Field>
            <Field id="planned_start" label="Planned start" error={errors.planned_start}>
              <Input id="planned_start" name="planned_start" type="date" defaultValue={dfow?.planned_start ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="phase" label="Current phase" error={errors.phase}>
              <NativeSelect id="phase" name="phase" defaultValue={dfow?.phase ?? "not_started"} disabled={pending} options={DFOW_PHASE} />
            </Field>
            <Field id="score" label="Quality score" error={errors.score}>
              <Input id="score" name="score" type="number" min={0} max={100} defaultValue={dfow?.score || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="prep_date" label="Preparatory" error={errors.prep_date}>
              <Input id="prep_date" name="prep_date" type="date" defaultValue={dfow?.prep_date ?? ""} disabled={pending} />
            </Field>
            <Field id="init_date" label="Initial" error={errors.init_date}>
              <Input id="init_date" name="init_date" type="date" defaultValue={dfow?.init_date ?? ""} disabled={pending} />
            </Field>
            <Field id="complete_date" label="Follow-up / closed" error={errors.complete_date}>
              <Input id="complete_date" name="complete_date" type="date" defaultValue={dfow?.complete_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="notes" label="Notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={3} defaultValue={dfow?.notes ?? ""} disabled={pending} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add DFOW"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
