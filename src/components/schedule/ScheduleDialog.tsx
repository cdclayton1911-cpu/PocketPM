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
import { scheduleItemSchema } from "@/lib/validation/schedule";
import { SCHEDULE_ITEM_STATUS, type ScheduleItem } from "@/types";

/**
 * One field for what an activity is. Replaced an is_milestone checkbox, which
 * could not say which end a milestone marks — and editing a finish milestone
 * through a checkbox would have saved it back as the only kind it knew.
 */
const ACTIVITY_TYPES = ["task", "start_milestone", "finish_milestone", "level_of_effort"] as const;
const ACTIVITY_TYPE_LABEL: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  task: "Task",
  start_milestone: "Start milestone",
  finish_milestone: "Finish milestone",
  level_of_effort: "Level of effort",
};

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
    // activity_type is a native select, so it arrives in FormData with
    // everything else — no controlled state to fall out of step.
    const parsed = (editing ? scheduleItemSchema.partial() : scheduleItemSchema).safeParse(raw);
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
            <Field id="target_start" label="Target start" error={errors.target_start}>
              <Input id="target_start" name="target_start" type="date" defaultValue={item?.target_start ?? ""} disabled={pending} />
            </Field>
            <Field id="target_finish" label="Target finish" error={errors.target_finish}>
              <Input id="target_finish" name="target_finish" type="date" defaultValue={item?.target_finish ?? ""} disabled={pending} />
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
            <Field id="activity_type" label="Type" error={errors.activity_type}>
              <NativeSelect
                id="activity_type"
                name="activity_type"
                labels={ACTIVITY_TYPE_LABEL}
                defaultValue={item?.activity_type || "task"}
                disabled={pending}
                options={ACTIVITY_TYPES}
              />
            </Field>
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
