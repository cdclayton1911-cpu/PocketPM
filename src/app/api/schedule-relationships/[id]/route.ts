import { NextResponse } from "next/server";

import { createClient, isPbError } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { scheduleRelationshipUpdateSchema } from "@/lib/validation/schedule-relationship";
import type { ScheduleRelationship } from "@/types";

/**
 * Edit a relationship's type, lag, or notes — never its endpoints.
 *
 * Moving an edge is deleting one and drawing another; allowing it here would
 * mean re-running the cycle check on update, and the two-step is clearer to a
 * user than an edit that can be silently refused.
 */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/schedule-relationships/[id]">,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = scheduleRelationshipUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }

  try {
    const pb = createClient(session.token);
    const record = await pb
      .collection("schedule_relationships")
      .update<ScheduleRelationship>(id, parsed.data);
    return NextResponse.json({ record });
  } catch (err) {
    if (isPbError(err) && (err.status === 404 || err.status === 403)) {
      return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
    }
    return NextResponse.json({ errors: { form: "Could not save" } }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/schedule-relationships/[id]">,
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });

  const { id } = await params;
  try {
    const pb = createClient(session.token);
    await pb.collection("schedule_relationships").delete(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isPbError(err) && (err.status === 404 || err.status === 403)) {
      return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
    }
    return NextResponse.json({ errors: { form: "Could not delete" } }, { status: 400 });
  }
}
