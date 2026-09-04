"use client";

import { Download, FileText, Paperclip, X } from "lucide-react";
import { useId, useState } from "react";

import { Field } from "@/components/shared/FormField";
import { fileFieldsFor } from "@/types/file-fields";

/**
 * Attach files to a record.
 *
 * One component for all eleven file fields on the schema rather than a bespoke
 * one per module: the limits differ, the behaviour does not. Limits are read
 * from the generated FILE_FIELDS spec, so a schema change to `maxSelect` or
 * `maxSize` reaches the UI by regenerating types rather than by editing markup.
 *
 * The parent form submits FormData; this contributes three kinds of entry:
 *
 *   - `<field>` file parts for new uploads,
 *   - `<field>-` string parts naming existing files to delete (PocketBase's
 *     own removal syntax),
 *   - nothing at all when the user touched neither, so an edit that does not
 *     mention files leaves them alone.
 */

function humanSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(bytes >= 10_485_760 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileField({
  collection,
  field,
  label,
  /** Filenames already stored on the record. */
  existing = [],
  /** Record id, needed to build download links. Absent when creating. */
  recordId,
  disabled,
  hint,
}: {
  collection: string;
  field: string;
  label: string;
  existing?: string[];
  recordId?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const spec = fileFieldsFor(collection)[field];
  const inputId = useId();

  const [removed, setRemoved] = useState<string[]>([]);
  const [picked, setPicked] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const kept = existing.filter((name) => !removed.includes(name));
  const multiple = (spec?.maxSelect ?? 1) > 1;
  const remaining = (spec?.maxSelect ?? 1) - kept.length;

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    setProblem(null);

    // Checked here for an immediate message; the route checks again, because a
    // client-side limit is a convenience and never a boundary.
    if (spec && spec.maxSize > 0) {
      const tooBig = chosen.find((f) => f.size > spec.maxSize);
      if (tooBig) {
        setProblem(`${tooBig.name} is ${humanSize(tooBig.size)}; the limit is ${humanSize(spec.maxSize)}`);
        event.target.value = "";
        return;
      }
    }
    if (chosen.length > remaining) {
      setProblem(
        remaining <= 0
          ? "Remove an existing file before adding another"
          : `Only ${remaining} more file${remaining === 1 ? "" : "s"} can be attached`,
      );
      event.target.value = "";
      return;
    }
    setPicked(chosen);
  }

  return (
    <Field id={inputId} label={label} error={problem ?? undefined}>
      <div className="flex flex-col gap-2">
        {kept.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {kept.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 rounded-r6 border bg-secondary/40 px-2 py-1.5 text-[13px]"
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {recordId ? (
                  <a
                    href={`/api/files/${collection}/${recordId}/${encodeURIComponent(name)}`}
                    className="shrink-0 text-muted-foreground hover:text-primary"
                    title={`Download ${name}`}
                  >
                    <Download className="size-3.5" aria-hidden />
                    <span className="sr-only">Download {name}</span>
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRemoved((r) => [...r, name])}
                  className="shrink-0 text-muted-foreground hover:text-danger disabled:opacity-50"
                  title={`Remove ${name}`}
                >
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">Remove {name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* PocketBase's removal syntax, submitted with the rest of the form. */}
        {removed.map((name) => (
          <input key={name} type="hidden" name={`${field}-`} value={name} />
        ))}

        <input
          id={inputId}
          type="file"
          name={field}
          multiple={multiple}
          disabled={disabled || remaining <= 0}
          onChange={onPick}
          accept={spec?.mimeTypes.length ? spec.mimeTypes.join(",") : undefined}
          className="block w-full text-[13px] text-muted-foreground file:mr-3 file:rounded-r6 file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-foreground hover:file:bg-secondary disabled:opacity-50"
        />

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Paperclip className="size-3" aria-hidden />
          {hint ??
            (spec
              ? `Up to ${spec.maxSelect} file${spec.maxSelect === 1 ? "" : "s"}, ${humanSize(spec.maxSize)} each.`
              : "")}
          {picked.length ? ` ${picked.length} selected.` : ""}
        </p>
      </div>
    </Field>
  );
}

/**
 * True when a form contains a file to upload or a file to remove.
 *
 * Lets a dialog send plain JSON when nothing about files changed, keeping the
 * common edit on the simpler path.
 */
export function formHasFiles(form: FormData): boolean {
  for (const [key, value] of form.entries()) {
    if (value instanceof File && value.size > 0) return true;
    if (key.endsWith("-") && typeof value === "string" && value) return true;
  }
  return false;
}

/** Scalar entries only — what Zod should see. Files are handled separately. */
export function scalarEntries(form: FormData): Record<string, string> {
  return Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => typeof value === "string" && !key.endsWith("-"),
    ),
  ) as Record<string, string>;
}

/**
 * The payload for a mutation: validated fields, plus files when there are any.
 *
 * Shared by every dialog with an attachment field so the rule stays in one
 * place — send JSON unless a file is being added or removed, and always build
 * the multipart body from the *validated* data rather than the raw form, since
 * Zod applies trimming, coercion, and defaults that the raw fields would lose.
 */
export function buildPayload(
  form: FormData,
  validated: Record<string, unknown>,
): FormData | Record<string, unknown> {
  if (!formHasFiles(form)) return validated;

  const payload = new FormData();
  for (const [key, value] of Object.entries(validated)) {
    if (value !== undefined && value !== null) payload.append(key, String(value));
  }
  for (const [key, value] of form.entries()) {
    if (value instanceof File && value.size > 0) payload.append(key, value);
    else if (key.endsWith("-") && typeof value === "string" && value) payload.append(key, value);
  }
  return payload;
}
