// Server-only: builds route handlers that talk to PocketBase.
import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { readActiveProjectId } from "@/lib/active-project";
import { createClient, isPbError, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import type { CollectionName, RecordOf } from "@/types";

/**
 * Route handlers for a project-scoped collection.
 *
 * Every module has the same CRUD shape, so it lives here once rather than being
 * copied 25 times. Each module's route.ts becomes a few lines.
 *
 * Two invariants this enforces, which callers cannot opt out of:
 *
 *  1. `project` is injected from the active-project cookie and stripped from the
 *     request body. A client cannot create a record inside someone else's
 *     project by naming it — the same protection the shell applies to `owner`.
 *  2. Every PocketBase call is made with the *user's* token, so the collection's
 *     project-scoped API rule does the access control. Nothing here runs as an
 *     admin.
 */
export interface CrudRouteOptions<K extends CollectionName> {
  collection: K;
  /** Validates the create body. `project` must NOT be part of it. */
  createSchema: z.ZodType<Record<string, unknown>>;
  /** Validates the update body; usually the create schema, partial. */
  updateSchema: z.ZodType<Record<string, unknown>>;
  /** Default PocketBase sort, e.g. "-created". */
  defaultSort?: string;
  /** Values merged into every create, e.g. `{ status: "pending_docs" }`. */
  createDefaults?: Record<string, unknown>;
  /**
   * Field to stamp with the signed-in user's id on create, e.g. "user".
   *
   * Injected server-side alongside `project` and equally un-overridable. Some
   * collections scope their rules by owner rather than by project membership —
   * `ai_sessions` is `user = @request.auth.id` — and a client-supplied value
   * there would let a caller create records attributed to someone else.
   */
  ownerField?: string;
}

function unauthorized() {
  return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
}

async function parseBody(request: Request) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown };
  } catch {
    return { ok: false as const };
  }
}

export function createCollectionRoute<K extends CollectionName>(options: CrudRouteOptions<K>) {
  const {
    collection,
    createSchema,
    updateSchema,
    defaultSort = "-created",
    createDefaults,
    ownerField,
  } = options;

  async function GET(request: Request) {
    const session = await getSession();
    if (!session) return unauthorized();

    const projectId = await readActiveProjectId();
    if (!projectId) {
      // No active project is a normal state (a brand-new account), not an error.
      return NextResponse.json({ items: [] });
    }

    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") || defaultSort;

    try {
      const pb = createClient(session.token);
      const items = await pb.collection(collection).getFullList<RecordOf<K>>({
        // pb.filter() escapes the parameter — never interpolate into a filter
        // string directly, or a crafted project id becomes filter injection.
        filter: pb.filter("project = {:project}", { project: projectId }),
        sort,
      });
      return NextResponse.json({ items });
    } catch {
      return NextResponse.json({ errors: { form: `Could not load ${collection}` } }, { status: 502 });
    }
  }

  async function POST(request: Request) {
    const session = await getSession();
    if (!session) return unauthorized();

    const projectId = await readActiveProjectId();
    if (!projectId) {
      return NextResponse.json(
        { errors: { form: "Select or create a project first" } },
        { status: 409 },
      );
    }

    const parsedBody = await parseBody(request);
    if (!parsedBody.ok) {
      return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
    }

    const parsed = createSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
    }

    try {
      const pb = createClient(session.token);
      const record = await pb.collection(collection).create<RecordOf<K>>({
        ...createDefaults,
        ...parsed.data,
        // Last, so neither can be overridden by anything in the body.
        ...(ownerField ? { [ownerField]: session.user.id } : {}),
        project: projectId,
      });
      return NextResponse.json({ record }, { status: 201 });
    } catch (err) {
      const fields = pbFieldErrors(err);
      return NextResponse.json(
        { errors: Object.keys(fields).length ? fields : { form: "Could not save" } },
        { status: 400 },
      );
    }
  }

  async function PATCH(request: Request, id: string) {
    const session = await getSession();
    if (!session) return unauthorized();

    const parsedBody = await parseBody(request);
    if (!parsedBody.ok) {
      return NextResponse.json({ errors: { form: "Invalid request body" } }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
    }

    try {
      const pb = createClient(session.token);
      // `project` is not in the update schema, so a record cannot be moved into
      // another project by editing it.
      const record = await pb.collection(collection).update<RecordOf<K>>(id, parsed.data);
      return NextResponse.json({ record });
    } catch (err) {
      // PocketBase 404s records the rule excludes, so a non-member sees the same
      // response as for a record that does not exist.
      if (isPbError(err) && (err.status === 404 || err.status === 403)) {
        return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
      }
      const fields = pbFieldErrors(err);
      return NextResponse.json(
        { errors: Object.keys(fields).length ? fields : { form: "Could not save" } },
        { status: 400 },
      );
    }
  }

  return { GET, POST, PATCH };
}
