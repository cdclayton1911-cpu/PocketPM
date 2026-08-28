import { NextResponse } from "next/server";

import { createClient, type PbAuthResponse } from "@/lib/pocketbase";
import { setSessionCookie } from "@/lib/session";
import { fieldErrorsFromZod, loginSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const { email, password } = parsed.data;

  try {
    const pb = createClient();
    const auth = (await pb
      .collection("users")
      .authWithPassword(email, password)) as unknown as PbAuthResponse;

    await setSessionCookie(auth.token);

    // The token stays in the httpOnly cookie and is never returned in the body.
    return NextResponse.json({ user: auth.record });
  } catch {
    // Deliberately generic and identical to the signup-conflict path: never
    // reveal whether an account exists for this address.
    return NextResponse.json(
      { errors: { form: "Incorrect email or password" } },
      { status: 401 },
    );
  }
}
