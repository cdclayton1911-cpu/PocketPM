import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { getPendingApprovers, type WorkflowInstanceRecord } from "@/lib/workflow/engine";
import { unauthorized } from "@/lib/workflow/http";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if ((entityType !== "submittal" && entityType !== "rfi") || !entityId) {
    return NextResponse.json({ errors: { form: "entityType and entityId are required" } }, { status: 400 });
  }

  const pb = createClient(session.token);
  const field = entityType === "submittal" ? "submittal" : "rfi";

  // The collection's list rule scopes this to the caller's projects, so an
  // entity in someone else's project simply yields nothing.
  const items = (await pb.collection("workflow_instances").getFullList({
    filter: pb.filter(`${field} = {:id}`, { id: entityId }),
    sort: "-created",
  })) as unknown as WorkflowInstanceRecord[];

  const instance = items[0] ?? null;
  if (!instance) return NextResponse.json({ instance: null, approvers: [] });

  const approvers = instance.status === "pending" ? await getPendingApprovers(pb, instance) : [];
  return NextResponse.json({ instance, approvers });
}
