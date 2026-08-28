import { NextResponse } from "next/server";

import { setActiveProjectId } from "@/lib/active-project";
import { createClient, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { projectSchema } from "@/lib/validation/project";
import type { Project } from "@/types";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  try {
    // Authenticated as the user, so PocketBase's owner/members rule filters the
    // list. We never query as an admin here — the rule is the access control.
    const pb = createClient(session.token);
    const projects = await pb
      .collection("projects")
      .getFullList<Project>({ sort: "-created" });

    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ errors: { form: "Could not load projects" } }, { status: 502 });
  }
}

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

  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  try {
    const pb = createClient(session.token);
    const project = await pb.collection("projects").create<Project>({
      ...parsed.data,
      // Set from the session, never from the body: `owner` is a required
      // relation and drives the access rule, so accepting a client-supplied
      // value would let anyone create a project owned by another user.
      owner: session.user.id,
      status: parsed.data.status ?? "active",
    });

    // A newly created project becomes the active one — otherwise the user
    // creates a project and appears to still be in the old one.
    await setActiveProjectId(project.id);

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const fields = pbFieldErrors(err);
    return NextResponse.json(
      { errors: Object.keys(fields).length ? fields : { form: "Could not create project" } },
      { status: 400 },
    );
  }
}
