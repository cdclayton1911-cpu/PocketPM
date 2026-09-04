"use client";

import { useState, type FormEvent } from "react";

import { FileField, formHasFiles } from "@/components/shared/FileField";
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
import { DISCIPLINE_LABEL } from "@/lib/enum-labels";
import { drawingSchema } from "@/lib/validation/drawing";
import { DRAWING_DISCIPLINE, DRAWING_STATUS, type Drawing } from "@/types";

import { drawingHooks } from "./DrawingsClient";

export function DrawingDialog({
  projectId,
  open,
  onOpenChange,
  drawing,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawing?: Drawing | null;
}) {
  const editing = Boolean(drawing);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = drawingHooks.useCreate(projectId);
  const update = drawingHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);

    // Validate the metadata only. The PDF is not something Zod can check — the
    // route enforces size, count, and type against the generated schema spec.
    const raw = Object.fromEntries(
      [...form.entries()].filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
    const parsed = (editing ? drawingSchema.partial() : drawingSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    /**
     * Send multipart only when a file is actually involved, so the ordinary
     * metadata edit stays on the JSON path.
     *
     * The payload is rebuilt from the validated data rather than reusing the
     * raw FormData: Zod applies trimming and defaults, and sending the raw
     * fields would quietly discard both.
     */
    let input: FormData | Record<string, unknown> = parsed.data;
    if (formHasFiles(form)) {
      const payload = new FormData();
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined && value !== null) payload.append(key, String(value));
      }
      for (const [key, value] of form.entries()) {
        if (value instanceof File && value.size > 0) payload.append(key, value);
        else if (key.endsWith("-") && typeof value === "string" && value) payload.append(key, value);
      }
      input = payload;
    }

    onOpenChange(false);
    if (editing && drawing) update.mutate({ id: drawing.id, input });
    else create.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit sheet" : "Add sheet"}</DialogTitle>
          <DialogDescription>
            Register a drawing sheet. Marking a sheet superseded keeps it in the history rather
            than removing it.
          </DialogDescription>
        </DialogHeader>

        <form key={drawing?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[130px_1fr] gap-3">
            <Field id="sheet_number" label="Sheet #" error={errors.sheet_number}>
              <Input id="sheet_number" name="sheet_number" placeholder="A-101" defaultValue={drawing?.sheet_number ?? ""} disabled={pending} />
            </Field>
            <Field id="title" label="Title" error={errors.title}>
              <Input id="title" name="title" placeholder="Floor Plan — Level 1" defaultValue={drawing?.title ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="discipline" label="Discipline" error={errors.discipline}>
              <NativeSelect
                id="discipline"
                name="discipline"
                labels={DISCIPLINE_LABEL}
                defaultValue={drawing?.discipline ?? "architectural"}
                disabled={pending}
                options={DRAWING_DISCIPLINE}
              />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={drawing?.status ?? "current"} disabled={pending} options={DRAWING_STATUS} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="revision" label="Revision" error={errors.revision}>
              <Input id="revision" name="revision" placeholder="3" defaultValue={drawing?.revision ?? ""} disabled={pending} />
            </Field>
            <Field id="rev_date" label="Revision date" error={errors.rev_date}>
              <Input id="rev_date" name="rev_date" type="date" defaultValue={drawing?.rev_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="notes" label="Notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={2} defaultValue={drawing?.notes ?? ""} disabled={pending} />
          </Field>

          <FileField
            collection="drawings"
            field="file"
            label="Drawing file (PDF)"
            existing={drawing?.file ? [drawing.file] : []}
            recordId={drawing?.id}
            disabled={pending}
            hint="One PDF, up to 100 MB. The sheet record is useful without it, but the drawing is the record."
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add sheet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
