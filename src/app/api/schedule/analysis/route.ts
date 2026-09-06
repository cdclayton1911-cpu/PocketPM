import { NextResponse } from "next/server";

import { resolveActiveProjectId } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { analyzeSchedule, persistCpm } from "@/lib/schedule/analyze";

function unauthorized() {
  return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
}

/** Fresh computation. Never reads the cached columns. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) return NextResponse.json({ analysis: null });

  const pb = createClient(session.token);
  const analysis = await analyzeSchedule(pb, projectId);
  return NextResponse.json({ analysis });
}

/**
 * Recalculate and store.
 *
 * The only thing that writes the cache columns. Separate from GET because
 * storing on read would make every page view a bulk write, and because the
 * user should be able to look at the numbers without changing anything.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json({ errors: { form: "Select a project first" } }, { status: 409 });
  }

  const pb = createClient(session.token);
  const analysis = await analyzeSchedule(pb, projectId);
  if (!analysis.outcome.ok) {
    return NextResponse.json({ errors: { form: analysis.outcome.error } }, { status: 400 });
  }
  const written = await persistCpm(pb, projectId, analysis);
  return NextResponse.json({ written });
}
