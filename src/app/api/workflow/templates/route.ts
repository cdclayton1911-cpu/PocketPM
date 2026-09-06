import { NextResponse } from "next/server";

import { createClient, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { parseTemplateSubmission } from "@/lib/validation/workflow-template";
import { unauthorized } from "@/lib/workflow/http";

/**
 * Templates are authored through the ordinary authenticated route.
 *
 * No admin client and no privileged proxy: the collection rules decide. A
 * project owner may write templates for a project they own; org-wide templates
 * (`project = ""`) require a superuser and are read-only here, which the UI
 * reflects rather than discovering through a 403.
 *
 * A template and its steps are edited as one unit, so they are written as one
 * request. PocketBase has no multi-record transaction over the REST API, so a
 * failure partway leaves the template without all its steps — surfaced to the
 * caller rather than hidden, since a half-written template is visible and
 * fixable, and startWorkflow refuses a template with no steps outright.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const pb = createClient(session.token);
  const items = await pb.collection("workflow_templates").getFullList({ sort: "name" });
  const steps = await pb.collection("workflow_steps").getFullList({ sort: "step_order" });

  return NextResponse.json({
    items: items.map((t) => ({ ...t, steps: steps.filter((s) => s.template === t.id) })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = parseTemplateSubmission(body, false);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  const pb = createClient(session.token);
  const { steps, ...template } = parsed.data;

  try {
    const created = await pb.collection("workflow_templates").create({
      ...template,
      created_by: session.user.id,
    });
    for (const step of steps) {
      await pb.collection("workflow_steps").create({ ...step, template: created.id });
    }
    return NextResponse.json({ record: created }, { status: 201 });
  } catch (err) {
    const fields = pbFieldErrors(err);
    return NextResponse.json(
      {
        errors: Object.keys(fields).length
          ? fields
          : { form: "Could not save. Only the owner of a project can author its templates." },
      },
      { status: 400 },
    );
  }
}
