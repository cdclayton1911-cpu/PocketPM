import { NextResponse } from "next/server";

import { createClient, isPbError, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { projectSchema } from "@/lib/validation/project";
import type { Project } from "@/types";

export async function PATCH(request: Request, { params }: RouteContext<"/api/projects/[id]">) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  // partial(): an edit dialog may submit only the fields it shows.
  const parsed = projectSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  // `owner` is not in the schema, so it cannot be reassigned through this route.
  // Changing ownership is a separate, deliberate action, not a field edit.
  try {
    const pb = createClient(session.token);
    const project = await pb.collection("projects").update<Project>(id, parsed.data);
    return NextResponse.json({ project });
  } catch (err) {
    // PocketBase returns 404 for a record the rule excludes, so a non-member
    // gets the same answer as for a project that does not exist.
    if (isPbError(err) && (err.status === 404 || err.status === 403)) {
      return NextResponse.json({ errors: { form: "Project not found" } }, { status: 404 });
    }
    const fields = pbFieldErrors(err);
    return NextResponse.json(
      { errors: Object.keys(fields).length ? fields : { form: "Could not update project" } },
      { status: 400 },
    );
  }
}
