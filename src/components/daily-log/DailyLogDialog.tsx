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
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { dailyLogSchema } from "@/lib/validation/daily-log";
import type { DailyLog } from "@/types";

import { dailyLogHooks } from "./DailyLogClient";

const NUMERIC_FIELDS = ["temp_high", "temp_low", "total_workers"];

/**
 * Create/edit a daily log.
 *
 * `ai_generated` is deliberately absent. The narrative task exists in
 * lib/ai/tasks.ts but the AI modules are waiting on Anthropic credits, so there
 * is nothing to generate with; an "AI narrative" box that no button fills would
 * be an empty promise. The field is still in the Zod schema, so a generated
 * value can be PATCHed in later without touching this form.
 */
export function DailyLogDialog({
  projectId,
  open,
  onOpenChange,
  log,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log?: DailyLog | null;
}) {
  const editing = Boolean(log);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = dailyLogHooks.useCreate(projectId);
  const update = dailyLogHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      NUMERIC_FIELDS,
    );
    const parsed = (editing ? dailyLogSchema.partial() : dailyLogSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    onOpenChange(false);
    if (editing && log) update.mutate({ id: log.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit daily log" : "New daily log"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this day's record."
              : "Record the day as it happened. This is the project's contemporaneous record."}
          </DialogDescription>
        </DialogHeader>

        <form key={log?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p
              role="alert"
              className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field id="log_date" label="Log date" error={errors.log_date}>
              <Input
                id="log_date"
                name="log_date"
                type="date"
                defaultValue={log?.log_date ?? ""}
                disabled={pending}
              />
            </Field>
            <Field id="total_workers" label="Workers on site" error={errors.total_workers}>
              <Input
                id="total_workers"
                name="total_workers"
                type="number"
                min={0}
                defaultValue={log?.total_workers || ""}
                disabled={pending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_100px_100px] gap-3">
            <Field id="weather" label="Weather" error={errors.weather}>
              {/* Free text, not a select: the collection has no enum for it, so
                  a fixed list would reject conditions PocketBase accepts. */}
              <Input
                id="weather"
                name="weather"
                placeholder="Clear, light wind"
                defaultValue={log?.weather ?? ""}
                disabled={pending}
              />
            </Field>
            <Field id="temp_high" label="High °F" error={errors.temp_high}>
              <Input
                id="temp_high"
                name="temp_high"
                type="number"
                defaultValue={log?.temp_high || ""}
                disabled={pending}
              />
            </Field>
            <Field id="temp_low" label="Low °F" error={errors.temp_low}>
              <Input
                id="temp_low"
                name="temp_low"
                type="number"
                defaultValue={log?.temp_low || ""}
                disabled={pending}
              />
            </Field>
          </div>

          <Field id="work_performed" label="Work performed" error={errors.work_performed}>
            <Textarea
              id="work_performed"
              name="work_performed"
              rows={4}
              placeholder="By area and trade — what was actually done."
              defaultValue={log?.work_performed ?? ""}
              disabled={pending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="deliveries" label="Deliveries" error={errors.deliveries}>
              <Textarea
                id="deliveries"
                name="deliveries"
                rows={2}
                defaultValue={log?.deliveries ?? ""}
                disabled={pending}
              />
            </Field>
            <Field id="equipment" label="Equipment on site" error={errors.equipment}>
              <Textarea
                id="equipment"
                name="equipment"
                rows={2}
                defaultValue={log?.equipment ?? ""}
                disabled={pending}
              />
            </Field>
          </div>

          <Field id="visitors" label="Visitors" error={errors.visitors}>
            <Input
              id="visitors"
              name="visitors"
              placeholder="Owner's rep, inspector, AHJ"
              defaultValue={log?.visitors ?? ""}
              disabled={pending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="issues" label="Delays, issues, conditions" error={errors.issues}>
              <Textarea
                id="issues"
                name="issues"
                rows={3}
                placeholder="Anything that cost time. This is the entry a claim rests on."
                defaultValue={log?.issues ?? ""}
                disabled={pending}
              />
            </Field>
            <Field id="safety_notes" label="Safety notes" error={errors.safety_notes}>
              <Textarea
                id="safety_notes"
                name="safety_notes"
                rows={3}
                defaultValue={log?.safety_notes ?? ""}
                disabled={pending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="signed_by" label="Signed by" error={errors.signed_by}>
              <Input
                id="signed_by"
                name="signed_by"
                defaultValue={log?.signed_by ?? ""}
                disabled={pending}
              />
            </Field>
            <Field id="signed_date" label="Signed date" error={errors.signed_date}>
              <Input
                id="signed_date"
                name="signed_date"
                type="date"
                defaultValue={log?.signed_date ?? ""}
                disabled={pending}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Save log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
