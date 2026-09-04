import { NextResponse } from "next/server";

import { resolveActiveProjectId } from "@/lib/active-project";
import { createClient, isPbError, pbFieldErrors } from "@/lib/pocketbase";
import { wouldCreateCycle, type Edge } from "@/lib/schedule/graph";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { scheduleRelationshipSchema } from "@/lib/validation/schedule-relationship";
import type { ScheduleRelationship } from "@/types";

/**
 * Schedule dependencies.
 *
 * Not built on `createCollectionRoute` because create needs to read the
 * existing graph first: a cycle cannot be expressed as a PocketBase rule, and
 * it has to be refused at write time. A cycle does not make the critical path
 * wrong — it makes the forward pass non-terminating.
 */

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) return NextResponse.json({ items: [] });

  try {
    const pb = createClient(session.token);
    const items = await pb.collection("schedule_relationships").getFullList<ScheduleRelationship>({
      filter: pb.filter("project = {:project}", { project: projectId }),
      sort: "created",
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ errors: { form: "Could not load relationships" } }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json({ errors: { form: "Select or create a project first" } }, { status: 409 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = scheduleRelationshipSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
  }
  const { predecessor, successor } = parsed.data;

  if (predecessor === successor) {
    return NextResponse.json(
      { errors: { successor: "An activity cannot depend on itself" } },
      { status: 400 },
    );
  }

  try {
    const pb = createClient(session.token);

    // Read the project's existing edges as the user, so the graph seen here is
    // the graph they are allowed to see — and so a relationship in another
    // project can never influence this decision.
    const existing = await pb.collection("schedule_relationships").getFullList<ScheduleRelationship>({
      filter: pb.filter("project = {:project}", { project: projectId }),
      fields: "predecessor,successor",
    });
    const edges: Edge[] = existing.map((r) => ({
      predecessor: r.predecessor,
      successor: r.successor,
    }));

    if (wouldCreateCycle(predecessor, successor, edges)) {
      return NextResponse.json(
        {
          errors: {
            successor:
              "That would create a circular dependency — this activity already comes after the one you are linking it to.",
          },
        },
        { status: 409 },
      );
    }

    const record = await pb.collection("schedule_relationships").create<ScheduleRelationship>({
      type: "FS",
      lag_days: 0,
      ...parsed.data,
      // Last, so the body cannot name another project.
      project: projectId,
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (err) {
    const fields = pbFieldErrors(err);

    // A duplicate edge arrives WITH field errors — the unique index on
    // (predecessor, successor) reports "Value must be unique." on both.
    if (fields.predecessor?.includes("unique") || fields.successor?.includes("unique")) {
      return NextResponse.json(
        { errors: { form: "That dependency already exists" } },
        { status: 409 },
      );
    }

    // A bare 400 with no field errors is the API rule refusing, and the only
    // way to trip it here is an endpoint outside this project — the rule
    // requires predecessor.project = project = successor.project. Saying
    // "already exists" for that (as an earlier version did) sends the user
    // looking for a duplicate that is not there.
    if (isPbError(err) && err.status === 400 && Object.keys(fields).length === 0) {
      return NextResponse.json(
        {
          errors: {
            form: "One or both activities are not in this project, so they cannot be linked.",
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { errors: Object.keys(fields).length ? fields : { form: "Could not save" } },
      { status: 400 },
    );
  }
}
