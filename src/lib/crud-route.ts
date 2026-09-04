// Server-only: builds route handlers that talk to PocketBase.
import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { resolveActiveProjectId } from "@/lib/active-project";
import { createClient, isPbError, pbFieldErrors } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import type { CollectionName, RecordOf } from "@/types";
import { fileFieldsFor, type FileFieldSpec } from "@/types/file-fields";

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

function isMultipart(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").includes("multipart/form-data");
}

function humanSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${Math.round(bytes / 1_048_576)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Check one field's files against the limits the schema declares.
 *
 * Done here, before anything is forwarded, so an oversized drawing fails with a
 * sentence rather than with a 400 from PocketBase after the bytes have crossed
 * the wire twice. PocketBase enforces these too — this is a better error, not
 * the security boundary.
 */
function checkFiles(field: string, files: File[], spec: FileFieldSpec): string | null {
  if (files.length > spec.maxSelect) {
    return spec.maxSelect === 1
      ? "Only one file can be attached here"
      : `At most ${spec.maxSelect} files can be attached here`;
  }
  for (const file of files) {
    if (spec.maxSize > 0 && file.size > spec.maxSize) {
      return `${file.name} is ${humanSize(file.size)}; the limit is ${humanSize(spec.maxSize)}`;
    }
    // An empty mimeTypes list means the schema places no restriction.
    if (spec.mimeTypes.length > 0 && file.type && !spec.mimeTypes.includes(file.type)) {
      return `${file.name} is a ${file.type}; this field accepts ${spec.mimeTypes.join(", ")}`;
    }
  }
  return null;
}

interface ParsedBody {
  /** Scalar fields, for Zod. */
  values: Record<string, unknown>;
  /** File entries by field name. Empty for a JSON request. */
  files: Record<string, File[]>;
  /**
   * Names of files the client asked to remove, by field. PocketBase spells this
   * as a `field-` key; the names are echoed back to it unchanged.
   */
  removals: Record<string, string[]>;
}

/**
 * Read the request body as either JSON or multipart.
 *
 * Multipart exists because PocketBase file uploads require it — the SDK takes a
 * FormData directly. Files therefore travel the same rule-checked path as every
 * other write rather than through a separate upload endpoint that would have to
 * reimplement project scoping.
 */
async function parseBody(
  request: Request,
  collection: CollectionName,
): Promise<{ ok: true; body: ParsedBody } | { ok: false; errors?: Record<string, string> }> {
  if (!isMultipart(request)) {
    try {
      const json = (await request.json()) as Record<string, unknown>;
      return { ok: true, body: { values: json, files: {}, removals: {} } };
    } catch {
      return { ok: false };
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false };
  }

  const specs = fileFieldsFor(collection);
  const values: Record<string, unknown> = {};
  const files: Record<string, File[]> = {};
  const removals: Record<string, string[]> = {};

  for (const [key, value] of form.entries()) {
    // PocketBase's removal syntax: "attachments-" with the filename to drop.
    if (key.endsWith("-") && specs[key.slice(0, -1)]) {
      if (typeof value === "string" && value) (removals[key.slice(0, -1)] ??= []).push(value);
      continue;
    }

    if (typeof value === "string") {
      values[key] = value;
      continue;
    }

    // A File. Only fields the schema declares as file fields are accepted —
    // otherwise a caller could stuff bytes into a text column.
    if (!specs[key]) {
      return { ok: false, errors: { form: `${key} does not accept a file` } };
    }
    // Browsers submit an empty file part for an untouched input; ignore it.
    if (value.size === 0 && !value.name) continue;
    (files[key] ??= []).push(value);
  }

  for (const [field, list] of Object.entries(files)) {
    const problem = checkFiles(field, list, specs[field]);
    if (problem) return { ok: false, errors: { [field]: problem } };
  }

  return { ok: true, body: { values, files, removals } };
}

/**
 * Build the payload for PocketBase.
 *
 * Returns a plain object when there is nothing to upload — PocketBase handles
 * both, and JSON keeps the common case simple and debuggable.
 */
function toPayload(
  validated: Record<string, unknown>,
  body: ParsedBody,
  injected: Record<string, unknown>,
): Record<string, unknown> | FormData {
  const hasFiles = Object.keys(body.files).length > 0 || Object.keys(body.removals).length > 0;
  if (!hasFiles) return { ...validated, ...injected };

  const form = new FormData();
  for (const [key, value] of Object.entries({ ...validated, ...injected })) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  for (const [field, list] of Object.entries(body.files)) {
    for (const file of list) form.append(field, file);
  }
  for (const [field, names] of Object.entries(body.removals)) {
    for (const name of names) form.append(`${field}-`, name);
  }
  return form;
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

    const projectId = await resolveActiveProjectId(session.token);
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

    const projectId = await resolveActiveProjectId(session.token);
    if (!projectId) {
      return NextResponse.json(
        { errors: { form: "Select or create a project first" } },
        { status: 409 },
      );
    }

    const parsedBody = await parseBody(request, collection);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { errors: parsedBody.errors ?? { form: "Invalid request body" } },
        { status: 400 },
      );
    }

    const parsed = createSchema.safeParse({ ...createDefaults, ...parsedBody.body.values });
    if (!parsed.success) {
      return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
    }

    try {
      const pb = createClient(session.token);
      const record = await pb.collection(collection).create<RecordOf<K>>(
        // project and owner go in last, so neither can be overridden by the body.
        toPayload({ ...createDefaults, ...parsed.data }, parsedBody.body, {
          ...(ownerField ? { [ownerField]: session.user.id } : {}),
          project: projectId,
        }),
      );
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

    const parsedBody = await parseBody(request, collection);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { errors: parsedBody.errors ?? { form: "Invalid request body" } },
        { status: 400 },
      );
    }

    const parsed = updateSchema.safeParse(parsedBody.body.values);
    if (!parsed.success) {
      return NextResponse.json({ errors: fieldErrorsFromZod(parsed.error) }, { status: 400 });
    }

    try {
      const pb = createClient(session.token);
      // `project` is not in the update schema and is not injected here, so a
      // record cannot be moved into another project by editing it.
      const record = await pb
        .collection(collection)
        .update<RecordOf<K>>(id, toPayload(parsed.data, parsedBody.body, {}));
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
