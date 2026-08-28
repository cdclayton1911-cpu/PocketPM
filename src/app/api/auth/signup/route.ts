import { NextResponse } from "next/server";

import { createClient, pbFieldErrors, type PbAuthResponse } from "@/lib/pocketbase";
import { setSessionCookie } from "@/lib/session";
import { fieldErrorsFromZod, signupSchema } from "@/lib/validation/auth";

/**
 * Public self-serve signup — `users.createRule` is "" by design
 * (see docs/schema-notes.md). Creates the account, then immediately signs in so
 * the user lands authenticated rather than at a second form.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const { name, email, password, passwordConfirm, company_name } = parsed.data;
  const pb = createClient();

  try {
    await pb.collection("users").create({
      email,
      password,
      passwordConfirm,
      name,
      ...(company_name ? { company_name } : {}),
      // `role` is a select on users; a self-serve signup owns their own account.
      role: "owner",
    });
  } catch (err) {
    const fields = pbFieldErrors(err);

    // PocketBase reports a duplicate address as a validation error on `email`.
    // Rewrite it so the response cannot be used to enumerate accounts: the
    // caller sees the same generic message either way.
    if (fields.email) {
      return NextResponse.json(
        { errors: { form: "Could not create that account. Try signing in instead." } },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { errors: Object.keys(fields).length ? fields : { form: "Could not create account" } },
      { status: 400 },
    );
  }

  // Created — now authenticate so the response carries a session.
  try {
    const auth = (await pb
      .collection("users")
      .authWithPassword(email, password)) as unknown as PbAuthResponse;

    await setSessionCookie(auth.token);
    return NextResponse.json({ user: auth.record }, { status: 201 });
  } catch {
    // The account exists but sign-in failed, which would be odd. Send them to
    // login rather than leaving them stuck on a form that now conflicts.
    return NextResponse.json(
      { errors: { form: "Account created, but sign-in failed. Please sign in." } },
      { status: 202 },
    );
  }
}
