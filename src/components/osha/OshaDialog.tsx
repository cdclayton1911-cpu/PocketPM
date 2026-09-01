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
import { safetyObservationSchema } from "@/lib/validation/safety";
import {
  SAFETY_OBSERVATION_SEVERITY,
  SAFETY_OBSERVATION_STATUS,
  SAFETY_OBSERVATION_TYPE,
  type SafetyObservation,
} from "@/types";

import { safetyHooks } from "./OshaClient";

export function OshaDialog({
  projectId,
  open,
  onOpenChange,
  observation,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observation?: SafetyObservation | null;
}) {
  const editing = Boolean(observation);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = safetyHooks.useCreate(projectId);
  const update = safetyHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = (editing ? safetyObservationSchema.partial() : safetyObservationSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    onOpenChange(false);
    if (editing && observation) update.mutate({ id: observation.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  // Defaults to today: an observation is nearly always logged the day it is seen.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit observation" : "Log safety observation"}</DialogTitle>
          <DialogDescription>
            Observations, near misses, recordables, and toolbox talks all live here.
          </DialogDescription>
        </DialogHeader>

        <form key={observation?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[140px_1fr] gap-3">
            <Field id="obs_date" label="Date" error={errors.obs_date}>
              <Input id="obs_date" name="obs_date" type="date" defaultValue={observation?.obs_date ?? today} disabled={pending} />
            </Field>
            <Field id="description" label="Observation" error={errors.description}>
              <Input id="description" name="description" defaultValue={observation?.description ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="location" label="Location" error={errors.location}>
              <Input id="location" name="location" defaultValue={observation?.location ?? ""} disabled={pending} />
            </Field>
            <Field id="trade" label="Trade" error={errors.trade}>
              <Input id="trade" name="trade" defaultValue={observation?.trade ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="type" label="Type" error={errors.type}>
              <NativeSelect id="type" name="type" defaultValue={observation?.type ?? "observation"} disabled={pending} options={SAFETY_OBSERVATION_TYPE} />
            </Field>
            <Field id="severity" label="Severity" error={errors.severity}>
              <NativeSelect id="severity" name="severity" defaultValue={observation?.severity ?? "minor"} disabled={pending} options={SAFETY_OBSERVATION_SEVERITY} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={observation?.status ?? "open"} disabled={pending} options={SAFETY_OBSERVATION_STATUS} />
            </Field>
          </div>

          <Field id="osha_reference" label="29 CFR reference" error={errors.osha_reference}>
            <Input id="osha_reference" name="osha_reference" placeholder="1926.501(b)(1)" defaultValue={observation?.osha_reference ?? ""} disabled={pending} />
          </Field>

          <Field id="corrective_action" label="Corrective action" error={errors.corrective_action}>
            <Textarea id="corrective_action" name="corrective_action" rows={3} defaultValue={observation?.corrective_action ?? ""} disabled={pending} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Log observation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
