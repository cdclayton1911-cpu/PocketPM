import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { startWorkflow } from "@/lib/workflow/engine";
import { engineErrorResponse, unauthorized } from "@/lib/workflow/http";

const schema = z.strictObject({
  entityType: z.enum(["submittal", "rfi"]),
  entityId: z.string().min(1).max(20),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const pb = createClient(session.token);
  // entityType is used only to pick which collection to READ; the project that
  // governs every scoping decision comes from the stored record, never here.
  const result = await startWorkflow(pb, parsed.data.entityType, parsed.data.entityId, session.user.id);
  if (!result.ok) return engineErrorResponse(result.error);

  // A null instance means no template is configured — a normal state, not an
  // error, and the caller carries on as if workflows did not exist.
  return NextResponse.json({ instance: result.value }, { status: result.value ? 201 : 200 });
}
