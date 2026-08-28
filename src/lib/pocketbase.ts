// Server-only: importing this from a client component is a BUILD ERROR, not a
// convention. It talks to PocketBase with the caller's token and must never be
// bundled for the browser.
import "server-only";

import PocketBase from "pocketbase";

import type { User } from "@/types";

export const PB_URL = process.env.NEXT_PUBLIC_PB_URL ?? "https://pb.pocketpm.fyi";

/**
 * Create a PocketBase client for a single request.
 *
 * Deliberately a factory, never a module-level singleton: the SDK's `authStore`
 * is stateful, so a shared instance on the server would leak one request's
 * authentication into another's. Create one per request, authenticate it, throw
 * it away.
 *
 * @param token - Auth token to load into the store, from the session cookie.
 */
export function createClient(token?: string): PocketBase {
  const pb = new PocketBase(PB_URL);

  // The SDK auto-refreshes tokens and writes back to the store; on the server
  // there is no browser to persist to, and we manage the cookie ourselves.
  pb.autoCancellation(false);

  if (token) {
    // The record argument is only used to populate `pb.authStore.record`. We
    // pass null because the caller has the token but not necessarily the record;
    // anything that needs the record calls authRefresh, which returns a real one.
    pb.authStore.save(token, null);
  }

  return pb;
}

/** Shape PocketBase returns from any auth endpoint. */
export interface PbAuthResponse {
  token: string;
  record: User;
}

/**
 * PocketBase errors carry the useful detail on `response`, not `message`.
 * Narrow to that rather than leaking a raw SDK error to callers.
 */
export interface PbErrorShape {
  status: number;
  message: string;
  data: Record<string, { code: string; message: string }>;
}

export function isPbError(err: unknown): err is { status: number; response: PbErrorShape } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

/**
 * Field-level validation errors from PocketBase, flattened for a form.
 * Returns an empty object when the error carries no field detail.
 */
export function pbFieldErrors(err: unknown): Record<string, string> {
  if (!isPbError(err)) return {};
  const data = err.response?.data;
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).map(([field, detail]) => [field, detail?.message ?? "Invalid value"]),
  );
}
