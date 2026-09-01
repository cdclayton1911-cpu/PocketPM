import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { clearSessionCookie } from "@/lib/session";
import { fieldErrorsFromZod, passwordResetConfirmSchema } from "@/lib/validation/auth";

/**
 * Complete a password reset.
 *
 * Unlike the request handler, this one reports failure plainly: the user is
 * holding a link they believe is valid, and "nothing happened" would be worse
 * than "that link has expired". A token is not an account identifier, so saying
 * it is invalid reveals nothing about who has an account.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const { token, password, passwordConfirm } = parsed.data;

  try {
    await createClient().collection("users").confirmPasswordReset(token, password, passwordConfirm);
  } catch {
    return NextResponse.json(
      {
        errors: {
          form: "That reset link is invalid or has expired. Request a new one.",
        },
      },
      { status: 400 },
    );
  }

  // Changing the password rotates the record's token key, so every existing
  // token is now dead — including this browser's, if it was signed in. Clear it
  // rather than leaving a cookie that will fail on the next request.
  await clearSessionCookie();

  return NextResponse.json({ message: "Password updated. Sign in with your new password." });
}
