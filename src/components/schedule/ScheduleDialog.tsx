"use client";

import { useState, type FormEvent } from "react";

import { dropEmptyNumbers, Field, NativeSelect } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { scheduleItemSchema } from "@/lib/validation/schedule";
import { SCHEDULE_ITEM_STATUS, type ScheduleItem } from "@/types";

import { scheduleHooks } from "./ScheduleClient";

export function ScheduleDialog({
  projectId,
  open,
  onOpenChange,
  item,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ScheduleItem | null;
}) {
  const editing = Boolean(item);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Controlled: shadcn's Checkbox is a Radix button, so it never appears in
  // FormData. Its value is merged in explicitly on submit.
  const [isMilestone, setIsMilestone] = useState(Boolean(item?.is_milestone));
  const create = scheduleHooks.useCreate(projectId);
  const update = scheduleHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      ["duration_days", "pct_complete", "sort_order"],
    );
    const parsed = (editing ? scheduleItemSchema.partial() : scheduleItemSchema).safeParse({
      ...raw,
      is_milestone: isMilestone,
    });
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
          <DialogTitle>{editing ? "Edit activity" : "Add activity"}</DialogTitle>
          <DialogDescription>Track planned dates against the current forecast.</DialogDescription>
        </DialogHeader>

        <form key={item?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field id="activity_id" label="Activity ID" error={errors.activity_id}>
              <Input id="activity_id" name="activity_id" placeholder="A1020" defaultValue={item?.activity_id ?? ""} disabled={pending} />
            </Field>
            <Field id="activity" label="Activity" error={errors.activity}>
              <Input id="activity" name="activity" defaultValue={item?.activity ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="planned_start" label="Planned start" error={errors.planned_start}>
              <Input id="planned_start" name="planned_start" type="date" defaultValue={item?.planned_start ?? ""} disabled={pending} />
            </Field>
            <Field id="planned_finish" label="Planned finish" error={errors.planned_finish}>
              <Input id="planned_finish" name="planned_finish" type="date" defaultValue={item?.planned_finish ?? ""} disabled={pending} />
            </Field>
            <Field id="forecast_finish" label="Forecast finish" error={errors.forecast_finish}>
              <Input id="forecast_finish" name="forecast_finish" type="date" defaultValue={item?.forecast_finish ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={item?.status ?? "not_started"} disabled={pending} options={SCHEDULE_ITEM_STATUS} />
            </Field>
            <Field id="pct_complete" label="% complete" error={errors.pct_complete}>
              <Input id="pct_complete" name="pct_complete" type="number" min={0} max={100} defaultValue={item?.pct_complete || ""} disabled={pending} />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_milestone"
              checked={isMilestone}
              onCheckedChange={(checked) => setIsMilestone(checked === true)}
              disabled={pending}
            />
            <Label htmlFor="is_milestone" className="text-sm font-normal">
              This activity is a milestone
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
