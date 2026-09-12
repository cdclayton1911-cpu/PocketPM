import { NextResponse } from "next/server";

import { resolveActiveProjectId } from "@/lib/active-project";
import { orphansBaselineItems, type ExistingBaseline } from "@/lib/import/dryrun";
import { previewImport } from "@/lib/import/preview";
import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";

const MAX_BYTES = 10 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
}

/**
 * Read the uploaded CSV. THE FILE IS NEVER STORED.
 *
 * An import source is a transient input, not a record. Storing it would create
 * a second copy of the schedule whose relationship to `schedule_items` becomes
 * undefined the moment anyone edits an activity. A user who wants the source
 * kept uploads it to project documents deliberately.
 */
async function readUpload(request: Request): Promise<
  { ok: true; form: FormData; bytes: Uint8Array } | { ok: false; response: NextResponse }
> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ errors: { form: "Attach a CSV file" } }, { status: 400 }),
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: `That file is ${Math.round(file.size / 1_048_576)} MB; the limit is 10 MB` } },
        { status: 400 },
      ),
    };
  }
  return { ok: true, form, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? value : null;
}

async function loadBaselines(
  pb: ReturnType<typeof createClient>,
  projectId: string,
): Promise<ExistingBaseline[]> {
  const baselines = await pb.collection("schedule_baselines").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
  });
  const items = await pb.collection("schedule_baseline_items").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
  });
  return baselines.map((b) => ({
    id: b.id,
    name: (b.name as string) || b.id,
    itemActivityIds: items.filter((i) => i.baseline === b.id).map((i) => String(i.activity_id ?? "")),
  }));
}

/** Dry run. Writes nothing, ever. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json({ errors: { form: "Select a project first" } }, { status: 409 });
  }

  const upload = await readUpload(request);
  if (!upload.ok) return upload.response;

  const pb = createClient(session.token);
  const outcome = previewImport({
    bytes: upload.bytes,
    rawMapping: field(upload.form, "mapping"),
    rawOrder: field(upload.form, "order"),
    baselines: await loadBaselines(pb, projectId),
  });
  // The message is specific — which header, which fields — so it is passed
  // through rather than replaced with a generic "invalid mapping".
  if (!outcome.ok) return NextResponse.json({ errors: { form: outcome.message } }, { status: 400 });

  return NextResponse.json({ report: outcome.report, mapping: outcome.mapping, order: outcome.order });
}

/**
 * Commit. Replaces the project's schedule.
 *
 * Re-runs the same preview server-side rather than trusting a report the
 * client says it saw — that is what makes the baseline acknowledgement a guard
 * rather than a warning.
 */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const projectId = await resolveActiveProjectId(session.token);
  if (!projectId) {
    return NextResponse.json({ errors: { form: "Select a project first" } }, { status: 409 });
  }

  const upload = await readUpload(request);
  if (!upload.ok) return upload.response;

  const pb = createClient(session.token);
  const outcome = previewImport({
    bytes: upload.bytes,
    rawMapping: field(upload.form, "mapping") ?? "{}",
    rawOrder: field(upload.form, "order"),
    baselines: await loadBaselines(pb, projectId),
  });
  if (!outcome.ok) return NextResponse.json({ errors: { form: outcome.message } }, { status: 400 });

  const { report, activities } = outcome;
  if (!report.canImport) {
    return NextResponse.json(
      { errors: { form: report.refusal ?? "This file cannot be imported." }, report },
      { status: 400 },
    );
  }
  if (orphansBaselineItems(report) && upload.form.get("acknowledgeBaselineOrphans") !== "true") {
    return NextResponse.json(
      {
        errors: {
          form: "This import would detach baseline items from the schedule. Confirm you accept that before importing.",
        },
        report,
      },
      { status: 409 },
    );
  }

  // Recorded FIRST. The latest import decides which calendar and data date the
  // analysis uses, and a CSV carries neither, so this record is what stops an
  // earlier P6 import's calendar and data-date floor being applied to a CSV
  // schedule. Written before the replace, so a replace that fails partway can
  // never leave the previous import's settings governing the new rows.
  await pb.collection("schedule_imports").create({
    project: projectId,
    imported_by: session.user.id,
    source_format: "csv",
    activity_count: activities.length,
  });

  // Replace: the schedule is mirrored, not authored, so a re-import is the
  // source of truth. Relationships go first — they cascade from activities and
  // would otherwise be orphaned mid-write.
  const existingRels = await pb.collection("schedule_relationships").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
  });
  for (const r of existingRels) await pb.collection("schedule_relationships").delete(r.id);
  const existingItems = await pb.collection("schedule_items").getFullList({
    filter: pb.filter("project = {:p}", { p: projectId }),
  });
  for (const i of existingItems) await pb.collection("schedule_items").delete(i.id);

  const idByActivityId = new Map<string, string>();
  for (const [index, a] of activities.entries()) {
    const created = await pb.collection("schedule_items").create({
      project: projectId,
      activity_id: a.activity_id,
      activity: a.activity,
      target_start: a.target_start,
      target_finish: a.target_finish,
      source_early_start: a.source_early_start,
      source_early_finish: a.source_early_finish,
      actual_start: a.actual_start,
      actual_finish: a.actual_finish,
      duration_days: a.duration_days ?? undefined,
      pct_complete: a.pct_complete ?? undefined,
      status: a.status || undefined,
      // Read by parseActivityTypeCell: P6's own labels, or a yes/no milestone
      // column, where yes is a start milestone since it cannot say which end.
      activity_type: a.activity_type,
      notes: a.notes,
      sort_order: a.sort_order ?? index,
    });
    idByActivityId.set(a.activity_id, created.id);
  }

  let relationships = 0;
  for (const a of activities) {
    const successor = idByActivityId.get(a.activity_id);
    if (!successor) continue;
    for (const p of a.predecessors) {
      const predecessor = idByActivityId.get(p.activity_id);
      if (!predecessor || p.problem) continue;
      await pb.collection("schedule_relationships").create({
        project: projectId,
        predecessor,
        successor,
        type: p.type,
        lag_days: p.lag_days,
      });
      relationships += 1;
    }
  }

  return NextResponse.json({
    imported: { activities: activities.length, relationships },
    baselines: report.baselines,
  });
}
