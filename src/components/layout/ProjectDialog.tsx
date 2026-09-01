"use client";

import { useRouter } from "next/navigation";
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
import { dropEmptyNumbers, Field, NativeSelect } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/validation/auth";
import { projectSchema } from "@/lib/validation/project";
import { PROJECT_CONTRACT_TYPE, PROJECT_STATUS, type Project } from "@/types";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent when creating. */
  project?: Project | null;
}

/** Shared by create and edit — the fields and validation are identical. */
export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const router = useRouter();
  const editing = Boolean(project);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const raw = dropEmptyNumbers(
      Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>,
      ["contract_value"],
    );

    const schema = editing ? projectSchema.partial() : projectSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    setPending(true);
    try {
      const res = await fetch(editing ? `/api/projects/${project!.id}` : "/api/projects", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
        setErrors(data.errors ?? { form: "Something went wrong. Try again." });
        setPending(false);
        return;
      }

      onOpenChange(false);
      setPending(false);
      // Server components own the project list, so refresh rather than mutating
      // local state — one source of truth.
      router.refresh();
    } catch {
      setErrors({ form: "Could not reach the server." });
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the project details."
              : "Create a project to work in. You can change any of this later."}
          </DialogDescription>
        </DialogHeader>

        {/* key remounts the form when switching target, so defaultValues reload */}
        <form key={project?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p
              role="alert"
              className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {errors.form}
            </p>
          ) : null}

          <Field id="name" label="Project name" error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={project?.name ?? ""}
              placeholder="Riverside Medical Building C"
              disabled={pending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="owner_name" label="Owner / client" error={errors.owner_name}>
              <Input id="owner_name" name="owner_name" defaultValue={project?.owner_name ?? ""} disabled={pending} />
            </Field>
            <Field id="architect_name" label="Architect" error={errors.architect_name}>
              <Input
                id="architect_name"
                name="architect_name"
                defaultValue={project?.architect_name ?? ""}
                disabled={pending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="contract_type" label="Contract type" error={errors.contract_type}>
              <NativeSelect
                id="contract_type"
                name="contract_type"
                defaultValue={project?.contract_type ?? "A101"}
                disabled={pending}
                options={PROJECT_CONTRACT_TYPE}
              />
            </Field>
            <Field id="contract_value" label="Contract value ($)" error={errors.contract_value}>
              <Input
                id="contract_value"
                name="contract_value"
                type="number"
                min={0}
                step={1000}
                defaultValue={project?.contract_value || ""}
                disabled={pending}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="start_date" label="Start date" error={errors.start_date}>
              <Input id="start_date" name="start_date" type="date" defaultValue={project?.start_date ?? ""} disabled={pending} />
            </Field>
            <Field id="end_date" label="Substantial completion" error={errors.end_date}>
              <Input id="end_date" name="end_date" type="date" defaultValue={project?.end_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_80px_1fr] gap-3">
            <Field id="city" label="City" error={errors.city}>
              <Input id="city" name="city" defaultValue={project?.city ?? ""} disabled={pending} />
            </Field>
            <Field id="state" label="State" error={errors.state}>
              <Input id="state" name="state" maxLength={2} defaultValue={project?.state ?? ""} disabled={pending} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect
                id="status"
                name="status"
                defaultValue={project?.status ?? "active"}
                disabled={pending}
                options={PROJECT_STATUS}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

