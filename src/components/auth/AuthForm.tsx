"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/validation/auth";
import { fieldErrorsFromZod, loginSchema, signupSchema } from "@/lib/validation/auth";

/**
 * Schemas are selected by key rather than passed as a prop: a Zod schema is a
 * class instance, and only plain objects can cross the server/client boundary.
 * Passing one directly fails the build with "Only plain objects... can be passed
 * to Client Components".
 */
const SCHEMAS = {
  login: loginSchema,
  signup: signupSchema,
} as const;

export type AuthSchemaKey = keyof typeof SCHEMAS;

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  placeholder?: string;
  optional?: boolean;
}

interface AuthFormProps {
  fields: AuthField[];
  /** Selects the same schema the route handler uses, so the two cannot drift. */
  schema: AuthSchemaKey;
  endpoint: string;
  submitLabel: string;
  pendingLabel: string;
  /** Where to go on success. Already validated server-side before reaching here. */
  redirectTo: string;
}

export function AuthForm({
  fields,
  schema: schemaKey,
  endpoint,
  submitLabel,
  pendingLabel,
  redirectTo,
}: AuthFormProps) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const raw = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;

    // Validate with the same schema the server uses — this is a convenience for
    // the user, not a security boundary. The route handler validates again.
    const parsed = SCHEMAS[schemaKey].safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }

    setPending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
        setErrors(data.errors ?? { form: "Something went wrong. Try again." });
        setPending(false);
        return;
      }

      // The session cookie is set by the response; refresh so server components
      // re-run and see it, then navigate.
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setErrors({ form: "Could not reach the server. Check your connection." });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.form ? (
        <p
          role="alert"
          className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {errors.form}
        </p>
      ) : null}

      {fields.map((field) => {
        const id = `auth-${field.name}`;
        const error = errors[field.name];
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {field.label}
              {field.optional ? <span className="ml-1 normal-case font-normal">(optional)</span> : null}
            </Label>
            <Input
              id={id}
              name={field.name}
              type={field.type ?? "text"}
              autoComplete={field.autoComplete}
              placeholder={field.placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              disabled={pending}
            />
            {error ? (
              <p id={`${id}-error`} className="text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
