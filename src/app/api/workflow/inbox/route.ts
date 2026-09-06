import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { getPendingApprovers, type WorkflowInstanceRecord } from "@/lib/workflow/engine";
import { unauthorized } from "@/lib/workflow/http";

/**
 * Everything waiting on the caller, across every project they belong to.
 *
 * Approver resolution is per-instance because `role` mode has to be looked up
 * against that instance's project. That is N+1 on role steps; at the scale this
 * app runs it is a handful of queries, and the alternative — denormalising
 * approvers onto the instance — would have to be kept correct as project roles
 * change, which is exactly the drift the snapshot design avoids elsewhere.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const pb = createClient(session.token);
  const pending = (await pb.collection("workflow_instances").getFullList({
    filter: pb.filter("status = {:s}", { s: "pending" }),
    sort: "-created",
  })) as unknown as WorkflowInstanceRecord[];

  const mine = [];
  for (const instance of pending) {
    const approvers = await getPendingApprovers(pb, instance);
    if (approvers.includes(session.user.id)) mine.push({ instance, approvers });
  }

  return NextResponse.json({ items: mine });
}
