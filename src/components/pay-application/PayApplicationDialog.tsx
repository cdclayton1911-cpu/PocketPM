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
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { payApplicationSchema } from "@/lib/validation/pay-application";
import { PAY_APPLICATION_STATUS, type PayApplication } from "@/types";

import { payAppHooks } from "./PayApplicationClient";

const NUMERIC = [
  "app_number",
  "scheduled_value",
  "prev_billed",
  "this_period",
  "stored_materials",
  "total_to_date",
  "retainage_pct",
  "retainage_amount",
  "net_this_period",
];

export function PayApplicationDialog({
  projectId,
  open,
  onOpenChange,
  payApp,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payApp?: PayApplication | null;
}) {
  const editing = Boolean(payApp);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = payAppHooks.useCreate(projectId);
  const update = payAppHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    // app_number is required, so it must not be stripped when blank — dropping
    // it would turn a missing value into a silent omission rather than an error.
    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      NUMERIC.filter((key) => key !== "app_number"),
    );
    const parsed = (editing ? payApplicationSchema.partial() : payApplicationSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    onOpenChange(false);
    if (editing && payApp) update.mutate({ id: payApp.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit application" : "New pay application"}</DialogTitle>
          <DialogDescription>
            AIA G702 summary. Net is derived from this period plus stored materials less
            retainage when not entered directly.
          </DialogDescription>
        </DialogHeader>

        <form key={payApp?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <Field id="app_number" label="Application #" error={errors.app_number}>
              <Input id="app_number" name="app_number" type="number" min={1} defaultValue={payApp?.app_number || ""} disabled={pending} />
            </Field>
            <Field id="period_start" label="Period from" error={errors.period_start}>
              <Input id="period_start" name="period_start" type="date" defaultValue={payApp?.period_start ?? ""} disabled={pending} />
            </Field>
            <Field id="period_end" label="Period to" error={errors.period_end}>
              <Input id="period_end" name="period_end" type="date" defaultValue={payApp?.period_end ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="scheduled_value" label="Scheduled value ($)" error={errors.scheduled_value}>
              <Input id="scheduled_value" name="scheduled_value" type="number" min={0} step={1000} defaultValue={payApp?.scheduled_value || ""} disabled={pending} />
            </Field>
            <Field id="prev_billed" label="Previously billed ($)" error={errors.prev_billed}>
              <Input id="prev_billed" name="prev_billed" type="number" min={0} step={1000} defaultValue={payApp?.prev_billed || ""} disabled={pending} />
            </Field>
            <Field id="this_period" label="This period ($)" error={errors.this_period}>
              <Input id="this_period" name="this_period" type="number" min={0} step={1000} defaultValue={payApp?.this_period || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="stored_materials" label="Stored materials ($)" error={errors.stored_materials}>
              <Input id="stored_materials" name="stored_materials" type="number" min={0} step={1000} defaultValue={payApp?.stored_materials || ""} disabled={pending} />
            </Field>
            <Field id="retainage_pct" label="Retainage (%)" error={errors.retainage_pct}>
              <Input id="retainage_pct" name="retainage_pct" type="number" min={0} max={100} step={0.5} defaultValue={payApp?.retainage_pct || ""} disabled={pending} />
            </Field>
            <Field id="retainage_amount" label="Retainage ($)" error={errors.retainage_amount}>
              <Input id="retainage_amount" name="retainage_amount" type="number" min={0} step={100} defaultValue={payApp?.retainage_amount || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={payApp?.status ?? "draft"} disabled={pending} options={PAY_APPLICATION_STATUS} />
            </Field>
            <Field id="submitted_date" label="Submitted" error={errors.submitted_date}>
              <Input id="submitted_date" name="submitted_date" type="date" defaultValue={payApp?.submitted_date ?? ""} disabled={pending} />
            </Field>
            <Field id="paid_date" label="Paid" error={errors.paid_date}>
              <Input id="paid_date" name="paid_date" type="date" defaultValue={payApp?.paid_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Create application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
