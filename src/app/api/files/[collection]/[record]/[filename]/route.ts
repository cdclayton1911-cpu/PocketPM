import { NextResponse } from "next/server";

import { createClient } from "@/lib/pocketbase";
import { getSession } from "@/lib/session";
import type { CollectionName } from "@/types";
import { FILE_FIELDS, fileFieldsFor } from "@/types/file-fields";

/**
 * Authenticated download for a stored file.
 *
 * Every file field is `protected: true` (all 14, checked against live
 * 2026-09-12), so PocketBase serves a file only with a valid, short-lived file
 * token, and every file collection's View rule requires project membership. A
 * leaked file URL without a token gets nothing.
 *
 * Links point here rather than at PocketBase directly. This handler:
 *
 *   1. requires a session,
 *   2. fetches the record **as that user**, so PocketBase's project-scoped view
 *      rule decides whether they may see it — a non-member gets the same 404 as
 *      for a record that does not exist,
 *   3. confirms the filename is actually attached to the field it claims, and
 *   4. redirects to PocketBase with a short-lived file token.
 *
 * The token expires within minutes, so a captured redirect URL stops working
 * shortly after it is issued. See docs/documents.md.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/files/[collection]/[record]/[filename]">,
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
  }

  const { collection, record: recordId, filename } = await params;

  // FILE_FIELDS is the allow-list: a collection with no file fields has no
  // files to serve, so it is not a valid target at all.
  if (!Object.hasOwn(FILE_FIELDS, collection)) {
    return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
  }
  const specs = fileFieldsFor(collection);

  const name = decodeURIComponent(filename);

  try {
    const pb = createClient(session.token);
    const rec = await pb
      .collection(collection as CollectionName)
      .getOne<Record<string, unknown>>(recordId);

    // The filename must be attached to one of this collection's file fields on
    // this record. Without the check, a caller who can view any record could
    // ask for an arbitrary path under it.
    const attached = Object.keys(specs).some((field) => {
      const value = rec[field];
      return Array.isArray(value) ? value.includes(name) : value === name;
    });
    if (!attached) {
      return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
    }

    const token = await pb.files.getToken();
    const url = pb.files.getURL(rec as { id: string; collectionId: string }, name, { token });
    return NextResponse.redirect(url);
  } catch {
    // PocketBase 404s records the view rule excludes, so a non-member and a
    // missing record are indistinguishable here — as they should be.
    return NextResponse.json({ errors: { form: "Not found" } }, { status: 404 });
  }
}
