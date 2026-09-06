// Server-only: shared response shaping for the workflow routes.
import "server-only";

import { NextResponse } from "next/server";

import type { EngineFailure } from "@/lib/workflow/engine";

/**
 * Engine failures map to HTTP here, in one place.
 *
 * `stale_step` is its own 409 rather than a generic conflict: the UI renders it
 * as "this step already moved on, reload", which is a different message from
 * "this workflow is already approved".
 */
export function engineErrorResponse(error: EngineFailure): NextResponse {
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden"
        ? 403
        : error.code === "conflict" || error.code === "stale_step"
          ? 409
          : 400;
  return NextResponse.json({ errors: { form: error.message }, code: error.code }, { status });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ errors: { form: "Not signed in" } }, { status: 401 });
}
