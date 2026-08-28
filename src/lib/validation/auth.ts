import { z } from "zod";

/**
 * Shared by the client form and the route handler, so the rules cannot drift
 * between what the UI accepts and what the server enforces.
 */

// PocketBase's users collection sets minPasswordLength: 8 (docs/pb_schema.json).
const PASSWORD_MIN = 8;

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    password: z
      .string()
      .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
    passwordConfirm: z.string().min(1, "Confirm your password"),
    company_name: z.string().trim().max(150).optional(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/** Field-keyed errors, the shape both the API and the form speak. */
export type FieldErrors = Record<string, string>;

/** Flatten a ZodError into one message per field. */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Where to send a user after authenticating.
 *
 * Only same-origin relative paths are allowed — a `next` parameter is
 * attacker-controllable, and echoing it into a redirect without this check is an
 * open-redirect. Rejects absolute URLs and protocol-relative `//evil.com`.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
