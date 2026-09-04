"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildPayload, FileField, scalarEntries } from "@/components/shared/FileField";
import { dropEmptyNumbers, Field, NativeSelect as Select } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { useCreateSubcontractor, useUpdateSubcontractor } from "@/hooks/useSubcontractors";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { subcontractorSchema } from "@/lib/validation/subcontractor";
import { SUBCONTRACTOR_A401_STATUS, SUBCONTRACTOR_STATUS, type Subcontractor } from "@/types";

/** Trades from the prototype's Add Subcontractor form. */
const TRADES = [
  "Electrical",
  "HVAC / Mechanical",
  "Plumbing",
  "Roofing",
  "Structural Steel",
  "Concrete",
  "Drywall / Framing",
  "Fire Protection",
  "Low Voltage / Security",
  "Glazing / Curtainwall",
  "Masonry",
  "Earthwork / Civil",
] as const;

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcontractor?: Subcontractor | null;
}

export function SubcontractorDialog({ projectId, open, onOpenChange, subcontractor }: Props) {
  const editing = Boolean(subcontractor);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useCreateSubcontractor(projectId);
  const update = useUpdateSubcontractor(projectId);
  const pending = create.isPending || update.isPending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const raw = dropEmptyNumbers(scalarEntries(form),
      ["bond_capacity", "emr", "quality_score"],
    );

    const schema = editing ? subcontractorSchema.partial() : subcontractorSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    // The dialog closes immediately: the mutation is optimistic, so the row is
    // already in the table, and errors surface as a toast with a rollback.
    const input = buildPayload(form, parsed.data);

    onOpenChange(false);
    if (editing && subcontractor) {
      update.mutate({ id: subcontractor.id, input });
    } else {
      create.mutate(parsed.data as Parameters<typeof create.mutate>[0]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit subcontractor" : "Add subcontractor"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the registry entry."
              : "New entries start as Pending docs until their paperwork is on file."}
          </DialogDescription>
        </DialogHeader>

        <form key={subcontractor?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field id="company_name" label="Company name" error={errors.company_name}>
              <Input id="company_name" name="company_name" defaultValue={subcontractor?.company_name ?? ""} disabled={pending} />
            </Field>
            <Field id="trade" label="Trade" error={errors.trade}>
              <Select id="trade" name="trade" defaultValue={subcontractor?.trade ?? TRADES[0]} disabled={pending} options={TRADES} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="license_number" label="License #" error={errors.license_number}>
              <Input id="license_number" name="license_number" defaultValue={subcontractor?.license_number ?? ""} disabled={pending} />
            </Field>
            <Field id="license_expiry" label="License expiry" error={errors.license_expiry}>
              <Input id="license_expiry" name="license_expiry" type="date" defaultValue={subcontractor?.license_expiry ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="insurance_expiry" label="Insurance expiry" error={errors.insurance_expiry}>
              <Input id="insurance_expiry" name="insurance_expiry" type="date" defaultValue={subcontractor?.insurance_expiry ?? ""} disabled={pending} />
            </Field>
            <Field id="bond_capacity" label="Bond capacity ($)" error={errors.bond_capacity}>
              <Input id="bond_capacity" name="bond_capacity" type="number" min={0} step={1000} defaultValue={subcontractor?.bond_capacity || ""} disabled={pending} />
            </Field>
            <Field id="emr" label="EMR" error={errors.emr}>
              <Input id="emr" name="emr" type="number" min={0} max={5} step={0.01} defaultValue={subcontractor?.emr || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="status" label="Status" error={errors.status}>
              <Select id="status" name="status" defaultValue={subcontractor?.status ?? "pending_docs"} disabled={pending} options={SUBCONTRACTOR_STATUS} />
            </Field>
            <Field id="a401_status" label="A401 status" error={errors.a401_status}>
              <Select id="a401_status" name="a401_status" defaultValue={subcontractor?.a401_status ?? "pending"} disabled={pending} options={SUBCONTRACTOR_A401_STATUS} />
            </Field>
            <Field id="quality_score" label="Quality score" error={errors.quality_score}>
              <Input id="quality_score" name="quality_score" type="number" min={0} max={100} defaultValue={subcontractor?.quality_score || ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="contact_name" label="Contact" error={errors.contact_name}>
              <Input id="contact_name" name="contact_name" defaultValue={subcontractor?.contact_name ?? ""} disabled={pending} />
            </Field>
            <Field id="contact_email" label="Email" error={errors.contact_email}>
              <Input id="contact_email" name="contact_email" type="email" defaultValue={subcontractor?.contact_email ?? ""} disabled={pending} />
            </Field>
            <Field id="contact_phone" label="Phone" error={errors.contact_phone}>
              <Input id="contact_phone" name="contact_phone" defaultValue={subcontractor?.contact_phone ?? ""} disabled={pending} />
            </Field>
          </div>

          <FileField
            collection="subcontractors"
            field="documents"
            label="Prequalification documents"
            existing={subcontractor?.documents ?? []}
            recordId={subcontractor?.id}
            disabled={pending}
            hint="Financial statements, insurance certificates, bond letters, licences."
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add to registry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

