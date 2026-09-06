import { NextResponse } from "next/server";

import { createClient, isPbError, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { parseTemplateSubmission } from "@/lib/validation/workflow-template";
import { unauthorized } from "@/lib/workflow/http";

export async function PATCH(request: Request, { params }: RouteContext<"/api/workflow/templates/[id]">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  // `editing` drops project and entity_type: the collection freezes project,
  // and an edit that sent it would be refused by the update rule.
  const parsed = parseTemplateSubmission(body, true);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const pb = createClient(session.token);
  const { steps, ...template } = parsed.data;

  try {
    const updated = await pb.collection("workflow_templates").update(id, template);

    // Steps are replaced wholesale rather than diffed. Reordering makes a diff
    // fight the unique (template, step_order) index — swapping two steps
    // collides mid-update unless the writes are ordered just so. Replacing is
    // simpler and safe: in-flight workflows read their snapshot, not this.
    const existing = await pb.collection("workflow_steps").getFullList({
      filter: pb.filter("template = {:id}", { id }),
    });
    for (const step of existing) await pb.collection("workflow_steps").delete(step.id);
    for (const step of steps) await pb.collection("workflow_steps").create({ ...step, template: id });

    return NextResponse.json({ record: updated });
  } catch (err) {
    if (isPbError(err) && (err.status === 404 || err.status === 403)) {
      return NextResponse.json(
        { errors: { form: "Not found, or you do not own this project" } },
        { status: 404 },
      );
    }
    const fields = pbFieldErrors(err);
    return NextResponse.json(
      { errors: Object.keys(fields).length ? fields : { form: "Could not save" } },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/workflow/templates/[id]">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const pb = createClient(session.token);
  try {
    // Steps cascade with the template.
    await pb.collection("workflow_templates").delete(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { errors: { form: "Not found, or you do not own this project" } },
      { status: 404 },
    );
  }
}
