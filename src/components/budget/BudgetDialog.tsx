"use client";

import { useState, type FormEvent } from "react";

import { dropEmptyNumbers, Field } from "@/components/shared/FormField";
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
import { budgetItemSchema } from "@/lib/validation/budget";
import type { BudgetItem } from "@/types";

import { budgetHooks } from "./BudgetClient";

const NUMERIC = ["budget", "committed", "actual", "pct_complete", "sort_order"];

export function BudgetDialog({
  projectId,
  open,
  onOpenChange,
  item,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: BudgetItem | null;
}) {
  const editing = Boolean(item);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = budgetHooks.useCreate(projectId);
  const update = budgetHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      NUMERIC,
    );
    const parsed = (editing ? budgetItemSchema.partial() : budgetItemSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    onOpenChange(false);
    if (editing && item) update.mutate({ id: item.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit budget line" : "Add budget line"}</DialogTitle>
          <DialogDescription>
            Track budget against committed and actual cost for one CSI division.
          </DialogDescription>
        </DialogHeader>

        <form key={item?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field id="csi_division" label="CSI div." error={errors.csi_division}>
              <Input id="csi_division" name="csi_division" placeholder="23" defaultValue={item?.csi_division ?? ""} disabled={pending} />
            </Field>
            <Field id="description" label="Description" error={errors.description}>
              <Input id="description" name="description" placeholder="HVAC" defaultValue={item?.description ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="budget" label="Budget ($)" error={errors.budget}>
              <Input id="budget" name="budget" type="number" min={0} step={1000} defaultValue={item?.budget || ""} disabled={pending} />
            </Field>
            <Field id="committed" label="Committed ($)" error={errors.committed}>
              <Input id="committed" name="committed" type="number" min={0} step={1000} defaultValue={item?.committed || ""} disabled={pending} />
            </Field>
            <Field id="actual" label="Actual ($)" error={errors.actual}>
              <Input id="actual" name="actual" type="number" min={0} step={1000} defaultValue={item?.actual || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="pct_complete" label="% complete" error={errors.pct_complete}>
              <Input id="pct_complete" name="pct_complete" type="number" min={0} max={100} defaultValue={item?.pct_complete || ""} disabled={pending} />
            </Field>
            <Field id="sort_order" label="Sort order" error={errors.sort_order}>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={item?.sort_order || ""} disabled={pending} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
