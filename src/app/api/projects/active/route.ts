import { NextResponse } from "next/server";

import { setActiveProjectId } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { setActiveProjectSchema } from "@/lib/validation/project";

/**
 * Set the active project.
 *
 * The cookie is not httpOnly, so a client could set it directly — this endpoint
 * exists to *verify membership before* writing it, so the stored value is always
 * a project the user can actually see. Setting the cookie by hand still grants
 * nothing: PocketBase's rules decide what any subsequent query returns.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = setActiveProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  // Fetch as the user: if the owner/members rule excludes this project,
  // PocketBase 404s and the cookie is left untouched.
  try {
    const pb = createClient(session.token);
    await pb.collection("projects").getOne(parsed.data.projectId, { fields: "id" });
  } catch {
    return NextResponse.json({ errors: { form: "Project not found" } }, { status: 404 });
  }

  await setActiveProjectId(parsed.data.projectId);
  return NextResponse.json({ ok: true, projectId: parsed.data.projectId });
}
