// Server-only: reads and writes the active-project cookie.
import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/pocketbase";
import type { Project } from "@/types";

/**
 * Holds the id of the project the user is currently working in.
 *
 * A cookie rather than localStorage, deliberately. Every module follows
 * "server component fetches → client component renders", and a server component
 * cannot read localStorage — so localStorage could never scope a server-side
 * fetch by project_id. A cookie is readable on both sides and avoids a
 * hydration mismatch.
 *
 * NOT httpOnly: the client reads it too, and it holds only a project id.
 * It is not an access grant — PocketBase's owner/members rules decide what the
 * user can actually see, so a tampered value yields an empty result, not a leak.
 */
export const ACTIVE_PROJECT_COOKIE = "pp_project";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readActiveProjectId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACTIVE_PROJECT_COOKIE)?.value || undefined;
}

export async function setActiveProjectId(projectId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_PROJECT_COOKIE, projectId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}

export async function clearActiveProjectId(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_PROJECT_COOKIE);
}

/**
 * Pick the active project from the ones the user can actually see.
 *
 * The cookie is only a hint. If it names a project that is not in `projects` —
 * deleted, access revoked, or simply tampered with — it is ignored and the first
 * available project is used instead. Returns null when the user has none.
 */
export function resolveActiveProject(
  projects: Project[],
  cookieValue: string | undefined,
): Project | null {
  if (projects.length === 0) return null;
  const fromCookie = cookieValue
    ? projects.find((project) => project.id === cookieValue)
    : undefined;
  return fromCookie ?? projects[0];
}

/**
 * The active project id for a request, resolved the same way a page resolves it.
 *
 * Route handlers must NOT read the cookie alone. The cookie is only set when a
 * project is created or explicitly switched to, so a user who signs in on a
 * second browser or device has projects but no cookie — while every module page
 * happily falls back to `projects[0]` via resolveActiveProject(). Trusting the
 * bare cookie in the API made the two disagree: pages rendered a project's
 * records, then the client's first refetch returned an empty list and every
 * create failed with "Select or create a project first".
 *
 * Costs one extra list call per request. Worth it to have exactly one
 * definition of "the active project" instead of two that drift.
 */
export async function resolveActiveProjectId(token: string): Promise<string | null> {
  const cookieValue = await readActiveProjectId();
  const pb = createClient(token);
  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  return resolveActiveProject(projects, cookieValue)?.id ?? null;
}
