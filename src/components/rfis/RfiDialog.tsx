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
import { rfiSchema } from "@/lib/validation/rfi";
import { RFI_COST_IMPACT, RFI_PRIORITY, RFI_STATUS, type Rfi } from "@/types";

import { rfiHooks } from "./RfisClient";

export function RfiDialog({
  projectId,
  open,
  onOpenChange,
  rfi,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfi?: Rfi | null;
}) {
  const editing = Boolean(rfi);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = rfiHooks.useCreate(projectId);
  const update = rfiHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      ["response_days", "cost_amount", "sched_days"],
    );
    const parsed = (editing ? rfiSchema.partial() : rfiSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    onOpenChange(false);
    if (editing && rfi) update.mutate({ id: rfi.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit RFI" : "New RFI"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this RFI." : "Raise a request for information with the A/E."}
          </DialogDescription>
        </DialogHeader>

        <form key={rfi?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field id="rfi_number" label="RFI #" error={errors.rfi_number}>
              <Input id="rfi_number" name="rfi_number" placeholder="003" defaultValue={rfi?.rfi_number ?? ""} disabled={pending} />
            </Field>
            <Field id="subject" label="Subject" error={errors.subject}>
              <Input id="subject" name="subject" defaultValue={rfi?.subject ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="question" label="Question / field condition" error={errors.question}>
            <Textarea id="question" name="question" rows={4} defaultValue={rfi?.question ?? ""} disabled={pending} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field id="drawing" label="Drawing(s)" error={errors.drawing}>
              <Input id="drawing" name="drawing" placeholder="S-201" defaultValue={rfi?.drawing ?? ""} disabled={pending} />
            </Field>
            <Field id="spec_section" label="Spec section" error={errors.spec_section}>
              <Input id="spec_section" name="spec_section" defaultValue={rfi?.spec_section ?? ""} disabled={pending} />
            </Field>
            <Field id="ball_in_court" label="Ball in court" error={errors.ball_in_court}>
              <Input id="ball_in_court" name="ball_in_court" placeholder="Structural EOR" defaultValue={rfi?.ball_in_court ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="submitted_date" label="Submitted" error={errors.submitted_date}>
              <Input id="submitted_date" name="submitted_date" type="date" defaultValue={rfi?.submitted_date ?? ""} disabled={pending} />
            </Field>
            <Field id="due_date" label="Response due" error={errors.due_date}>
              <Input id="due_date" name="due_date" type="date" defaultValue={rfi?.due_date ?? ""} disabled={pending} />
            </Field>
            <Field id="response_days" label="Response days" error={errors.response_days}>
              <Input id="response_days" name="response_days" type="number" min={1} max={60} defaultValue={rfi?.response_days || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={rfi?.status ?? "open"} disabled={pending} options={RFI_STATUS} />
            </Field>
            <Field id="priority" label="Priority" error={errors.priority}>
              <NativeSelect id="priority" name="priority" defaultValue={rfi?.priority ?? "standard"} disabled={pending} options={RFI_PRIORITY} />
            </Field>
            <Field id="cost_impact" label="Cost impact" error={errors.cost_impact}>
              <NativeSelect id="cost_impact" name="cost_impact" defaultValue={rfi?.cost_impact ?? "unknown"} disabled={pending} options={RFI_COST_IMPACT} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="cost_amount" label="Cost amount ($)" error={errors.cost_amount}>
              <Input id="cost_amount" name="cost_amount" type="number" min={0} defaultValue={rfi?.cost_amount || ""} disabled={pending} />
            </Field>
            <Field id="sched_days" label="Schedule impact (days)" error={errors.sched_days}>
              <Input id="sched_days" name="sched_days" type="number" min={0} defaultValue={rfi?.sched_days || ""} disabled={pending} />
            </Field>
          </div>

          {editing ? (
            <Field id="answer" label="A/E response" error={errors.answer}>
              <Textarea id="answer" name="answer" rows={3} defaultValue={rfi?.answer ?? ""} disabled={pending} />
            </Field>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Log RFI"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
