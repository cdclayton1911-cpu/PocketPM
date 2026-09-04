"use client";

import { useState, type FormEvent } from "react";

import { buildPayload, FileField, scalarEntries } from "@/components/shared/FileField";
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
import { aiaNoticeSchema } from "@/lib/validation/aia-notice";
import { AIA_NOTICE_STATUS, type AiaNotice } from "@/types";

import { noticeHooks } from "./AiaNoticesClient";

/** Common AIA A201 notice types, from the prototype's drafter. */
const NOTICE_TYPES = [
  "Claim — Differing Site Conditions",
  "Claim — Owner-Caused Delay",
  "Claim — Design Error / Omission",
  "Request for Time Extension",
  "Notice of Delay",
  "Notice of Dispute",
  "Request for Change Order",
  "Pay Application Certification",
  "Substantial Completion Notice",
  "Final Completion",
] as const;

export function AiaNoticeDialog({
  projectId,
  open,
  onOpenChange,
  notice,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice?: AiaNotice | null;
}) {
  const editing = Boolean(notice);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = noticeHooks.useCreate(projectId);
  const update = noticeHooks.useUpdate(projectId);
  const pending = create.isPending || update.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const raw = scalarEntries(form);
    const parsed = (editing ? aiaNoticeSchema.partial() : aiaNoticeSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    const input = buildPayload(form, parsed.data);

    onOpenChange(false);
    if (editing && notice) update.mutate({ id: notice.id, input });
    else create.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit notice" : "Log notice obligation"}</DialogTitle>
          <DialogDescription>
            A notice deadline is a contractual bar. Missing it can forfeit the claim entirely.
          </DialogDescription>
        </DialogHeader>

        <form key={notice?.id ?? "new"} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errors.form ? (
            <p role="alert" className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
              {errors.form}
            </p>
          ) : null}

          <Field id="notice_type" label="Notice type" error={errors.notice_type}>
            <NativeSelect id="notice_type" name="notice_type" humanize={false} defaultValue={notice?.notice_type ?? NOTICE_TYPES[0]} disabled={pending} options={NOTICE_TYPES} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="aia_article" label="AIA article" error={errors.aia_article}>
              <Input id="aia_article" name="aia_article" placeholder="Art. 15.1.2" defaultValue={notice?.aia_article ?? ""} disabled={pending} />
            </Field>
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect id="status" name="status" defaultValue={notice?.status ?? "upcoming"} disabled={pending} options={AIA_NOTICE_STATUS} />
            </Field>
          </div>

          <Field id="trigger_event" label="Trigger event" error={errors.trigger_event}>
            <Input id="trigger_event" name="trigger_event" placeholder="Rock encountered at footing F-12" defaultValue={notice?.trigger_event ?? ""} disabled={pending} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field id="trigger_date" label="Triggered" error={errors.trigger_date}>
              <Input id="trigger_date" name="trigger_date" type="date" defaultValue={notice?.trigger_date ?? ""} disabled={pending} />
            </Field>
            <Field id="notice_deadline" label="Deadline" error={errors.notice_deadline}>
              <Input id="notice_deadline" name="notice_deadline" type="date" defaultValue={notice?.notice_deadline ?? ""} disabled={pending} />
            </Field>
            <Field id="notice_sent_date" label="Sent" error={errors.notice_sent_date}>
              <Input id="notice_sent_date" name="notice_sent_date" type="date" defaultValue={notice?.notice_sent_date ?? ""} disabled={pending} />
            </Field>
          </div>

          <Field id="description" label="Description" error={errors.description}>
            <Textarea id="description" name="description" rows={3} defaultValue={notice?.description ?? ""} disabled={pending} />
          </Field>

          <FileField
            collection="aia_notices"
            field="attachments"
            label="Attachments"
            existing={notice?.attachments ?? []}
            recordId={notice?.id}
            disabled={pending}
            hint="The notice as sent, and proof of delivery. A notice you cannot evidence was sent is a notice you did not send."
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Log notice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
