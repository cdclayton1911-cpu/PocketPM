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
import { ROLE_LABEL } from "@/lib/enum-labels";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { parseProjectRoleSubmission } from "@/lib/validation/project-role";
import { PROJECT_ROLE_ROLE, type ProjectRole } from "@/types";

import { projectRoleHooks } from "./ProjectTeamClient";

/**
 * Record a party on the project.
 *
 * Only outside parties are enterable here. Linking an existing account to a
 * role needs a user picker, and the only list available is `users.listRule`,
 * which today returns every user across every company — a known issue recorded
 * in docs/schema-notes.md. Shipping a picker on top of it would put that
 * directory in front of users, so the internal case waits for the narrowing.
 */
export function ProjectRoleDialog({
  projectId,
  open,
  onOpenChange,
  role,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: ProjectRole | null;
}) {
  const editing = Boolean(role);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = projectRoleHooks.useCreate(projectId);
  const update = projectRoleHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const raw = Object.fromEntries(form) as Record<string, string>;
    raw.is_external = form.get("is_external") ? "true" : "";
    // Preserved rather than dropped: an edit must not unlink an account just
    // because this form cannot pick one.
    if (role?.user) raw.user = role.user;

    const parsed = parseProjectRoleSubmission(raw, editing ? role : null);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    onOpenChange(false);
    if (editing && role) update.mutate({ id: role.id, input: parsed.data });
    else create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit party" : "Add a party"}</DialogTitle>
          <DialogDescription>
            The architect, the owner&apos;s rep, the engineer. Recording someone here does not give
            them access to this project.
          </DialogDescription>
        </DialogHeader>

        <form key={role?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <div className="grid grid-cols-[1fr_180px] gap-3">
            <Field id="contact_name" label="Name" error={errors.contact_name}>
              <Input id="contact_name" name="contact_name" placeholder="A. Vasquez" defaultValue={role?.contact_name ?? ""} disabled={pending} />
            </Field>
            <Field id="role" label="Role" error={errors.role}>
              <NativeSelect id="role" name="role" labels={ROLE_LABEL} defaultValue={role?.role ?? "architect"} disabled={pending} options={PROJECT_ROLE_ROLE} />
            </Field>
          </div>

          <Field id="company" label="Company" error={errors.company}>
            <Input id="company" name="company" placeholder="AE Partners LLP" defaultValue={role?.company ?? ""} disabled={pending} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="contact_email" label="Email" error={errors.contact_email}>
              <Input id="contact_email" name="contact_email" type="email" defaultValue={role?.contact_email ?? ""} disabled={pending} />
            </Field>
            <Field id="contact_phone" label="Phone" error={errors.contact_phone}>
              <Input id="contact_phone" name="contact_phone" defaultValue={role?.contact_phone ?? ""} disabled={pending} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="is_external" className="size-3.5 accent-primary" defaultChecked={role ? role.is_external : true} disabled={pending} />
            Outside party — not part of our company
          </label>

          {editing ? (
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={role?.status ?? "active"} disabled={pending} options={["active", "inactive"]} />
            </Field>
          ) : null}

          <Field id="notes" label="Notes" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={2} defaultValue={role?.notes ?? ""} disabled={pending} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Add party"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
