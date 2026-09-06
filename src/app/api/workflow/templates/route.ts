import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/workflow/http";

/**
 * Templates are readable here; they are NOT writable here.
 *
 * The brief asked for admin-only CRUD. Reads work — the list rule shows a
 * caller org-wide templates plus their own projects'. Writes cannot: the
 * collection's create/update/delete rules are `null`, meaning superuser only,
 * and this app has no admin PocketBase client. Every server path acts with the
 * caller's token (src/lib/crud-route.ts, src/lib/module-page.ts), so there is
 * no credential here that could satisfy those rules.
 *
 * Making this route work therefore requires a decision, not code: either
 * introduce a service account whose credentials live in the production
 * environment — a privileged path that bypasses the 108 project rules the app's
 * tenancy rests on — or relax the collection rules so that, say, a project
 * owner may write their own project's templates. Both are real options; picking
 * one silently would be the wrong way to settle it.
 *
 * Until then templates are seeded through the PocketBase admin UI, which is
 * also why docs/STATUS.md records that the first workflow in any org needs an
 * admin action.
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

function notWritable() {
  return NextResponse.json(
    {
      errors: {
        form:
          "Workflow templates cannot be written through the app yet. Their PocketBase rules are superuser-only and this app has no admin client — seed them in the PocketBase admin UI.",
      },
      code: "not_implemented",
    },
    { status: 501 },
  );
}

export const POST = notWritable;
export const PATCH = notWritable;
export const DELETE = notWritable;
