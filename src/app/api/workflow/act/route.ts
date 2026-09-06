import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { act } from "@/lib/workflow/engine";
import { engineErrorResponse, unauthorized } from "@/lib/workflow/http";
import { fileFieldsFor } from "@/types/file-fields";

const schema = z.strictObject({
  instanceId: z.string().min(1).max(20),
  action: z.enum(["approve", "reject", "comment", "reassign", "cancel"]),
  comment: z.string().trim().max(5000).optional(),
  expectedStepOrder: z.coerce.number().int().min(1),
});

function humanSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${Math.round(bytes / 1_048_576)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const multipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

  let values: Record<string, unknown>;
  let attachments: FormData | undefined;

  if (multipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });

    values = {};
    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        values[key] = value;
      } else if (key === "attachments") {
        // Browsers submit an empty part for an untouched input.
        if (value.size > 0 || value.name) files.push(value);
      } else {
        return NextResponse.json({ errors: { form: `${key} does not accept a file` } }, { status: 400 });
      }
    }

    // Checked here against the generated spec, the same as crud-route, so an
    // oversized attachment fails with a sentence instead of a 400 from
    // PocketBase after the bytes have crossed the wire twice.
    const spec = fileFieldsFor("workflow_actions").attachments;
    if (files.length > spec.maxSelect) {
      return NextResponse.json(
        { errors: { attachments: `At most ${spec.maxSelect} files can be attached here` } },
        { status: 400 },
      );
    }
    for (const file of files) {
      if (spec.maxSize > 0 && file.size > spec.maxSize) {
        return NextResponse.json(
          { errors: { attachments: `${file.name} is ${humanSize(file.size)}; the limit is ${humanSize(spec.maxSize)}` } },
          { status: 400 },
        );
      }
    }

    if (files.length) {
      attachments = new FormData();
      for (const f of files) attachments.append("attachments", f);
    }
  } else {
    values = (await request.json().catch(() => null)) as Record<string, unknown>;
    if (!values) return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
  }

  const pb = createClient(session.token);
  const result = await act(pb, {
    instanceId: parsed.data.instanceId,
    actorId: session.user.id,
    action: parsed.data.action,
    comment: parsed.data.comment,
    expectedStepOrder: parsed.data.expectedStepOrder,
    attachments,
  });
  if (!result.ok) return engineErrorResponse(result.error);
  return NextResponse.json({ instance: result.value });
}
