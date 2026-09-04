"use client";

import { useState, type FormEvent } from "react";

import { buildPayload, FileField, scalarEntries } from "@/components/shared/FileField";
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
import { changeOrderSchema } from "@/lib/validation/change-order";
import {
  CHANGE_ORDER_REASON,
  CHANGE_ORDER_STATUS,
  CHANGE_ORDER_TYPE,
  type ChangeOrder,
} from "@/types";

import { coHooks } from "./ChangeOrdersClient";

export function ChangeOrderDialog({
  projectId,
  open,
  onOpenChange,
  changeOrder,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeOrder?: ChangeOrder | null;
}) {
  const editing = Boolean(changeOrder);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = coHooks.useCreate(projectId);
  const update = coHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const raw = dropEmptyNumbers(scalarEntries(form),
      ["amount", "days_impact"],
    );
    const parsed = (editing ? changeOrderSchema.partial() : changeOrderSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    const input = buildPayload(form, parsed.data);

    onOpenChange(false);
    if (editing && changeOrder) update.mutate({ id: changeOrder.id, input });
    else create.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit change order" : "New change order"}</DialogTitle>
          <DialogDescription>
            Only approved change orders adjust the contract value. A deductive change is entered
            as a negative amount.
          </DialogDescription>
        </DialogHeader>

        <form key={changeOrder?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field id="co_number" label="CO #" error={errors.co_number}>
              <Input id="co_number" name="co_number" placeholder="PCO-004" defaultValue={changeOrder?.co_number ?? ""} disabled={pending} />
            </Field>
            <Field id="description" label="Description" error={errors.description}>
              <Input id="description" name="description" defaultValue={changeOrder?.description ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="type" label="Type" error={errors.type}>
              <NativeSelect id="type" name="type" humanize={false} defaultValue={changeOrder?.type ?? "PCO"} disabled={pending} options={CHANGE_ORDER_TYPE} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={changeOrder?.status ?? "draft"} disabled={pending} options={CHANGE_ORDER_STATUS} />
            </Field>
            <Field id="reason" label="Reason" error={errors.reason}>
              <NativeSelect id="reason" name="reason" defaultValue={changeOrder?.reason ?? "owner_directed"} disabled={pending} options={CHANGE_ORDER_REASON} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="amount" label="Amount ($)" error={errors.amount}>
              <Input id="amount" name="amount" type="number" step={100} defaultValue={changeOrder?.amount || ""} disabled={pending} />
            </Field>
            <Field id="days_impact" label="Days impact" error={errors.days_impact}>
              <Input id="days_impact" name="days_impact" type="number" min={0} defaultValue={changeOrder?.days_impact || ""} disabled={pending} />
            </Field>
            <Field id="initiated_by" label="Initiated by" error={errors.initiated_by}>
              <Input id="initiated_by" name="initiated_by" placeholder="Owner" defaultValue={changeOrder?.initiated_by ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="submitted_date" label="Submitted" error={errors.submitted_date}>
              <Input id="submitted_date" name="submitted_date" type="date" defaultValue={changeOrder?.submitted_date ?? ""} disabled={pending} />
            </Field>
            <Field id="approved_date" label="Approved" error={errors.approved_date}>
              <Input id="approved_date" name="approved_date" type="date" defaultValue={changeOrder?.approved_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="scope" label="Scope of work" error={errors.scope}>
            <Textarea id="scope" name="scope" rows={3} defaultValue={changeOrder?.scope ?? ""} disabled={pending} />
          </Field>

          <FileField
            collection="change_orders"
            field="attachments"
            label="Backup documentation"
            existing={changeOrder?.attachments ?? []}
            recordId={changeOrder?.id}
            disabled={pending}
            hint="Quotes, markups, correspondence — the backup a change order is priced from."
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Create CO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
