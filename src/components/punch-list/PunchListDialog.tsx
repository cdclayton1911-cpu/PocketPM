"use client";

import { useState, type FormEvent } from "react";

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
import { punchListSchema } from "@/lib/validation/punch-list";
import { PUNCH_LIST_ITEM_PRIORITY, PUNCH_LIST_ITEM_STATUS, type PunchListItem } from "@/types";

import { punchHooks } from "./PunchListClient";

export function PunchListDialog({
  projectId,
  open,
  onOpenChange,
  item,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: PunchListItem | null;
}) {
  const editing = Boolean(item);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = punchHooks.useCreate(projectId);
  const update = punchHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = (editing ? punchListSchema.partial() : punchListSchema).safeParse(raw);
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
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit punch item" : "Add punch item"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this item." : "Log a deficiency found during a closeout walk."}
          </DialogDescription>
        </DialogHeader>

        <form key={item?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field id="item_number" label="Item #" error={errors.item_number}>
              <Input id="item_number" name="item_number" placeholder="P-001" defaultValue={item?.item_number ?? ""} disabled={pending} />
            </Field>
            <Field id="description" label="Description" error={errors.description}>
              <Input id="description" name="description" defaultValue={item?.description ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="location" label="Location" error={errors.location}>
              <Input id="location" name="location" placeholder="Lvl 2, Rm 218" defaultValue={item?.location ?? ""} disabled={pending} />
            </Field>
            <Field id="trade" label="Trade" error={errors.trade}>
              <Input id="trade" name="trade" placeholder="Door hardware" defaultValue={item?.trade ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="priority" label="Priority" error={errors.priority}>
              <NativeSelect id="priority" name="priority" defaultValue={item?.priority ?? "medium"} disabled={pending} options={PUNCH_LIST_ITEM_PRIORITY} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={item?.status ?? "open"} disabled={pending} options={PUNCH_LIST_ITEM_STATUS} />
            </Field>
            <Field id="due_date" label="Due" error={errors.due_date}>
              <Input id="due_date" name="due_date" type="date" defaultValue={item?.due_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="notes" label="Notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={3} defaultValue={item?.notes ?? ""} disabled={pending} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
