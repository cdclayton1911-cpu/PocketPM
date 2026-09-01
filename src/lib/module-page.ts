// Server-only: session + PocketBase access for module pages.
import "server-only";

import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { CollectionName, Project, RecordOf } from "@/types";

/**
 * Server-side loader shared by every module page.
 *
 * Resolves the session and active project, then fetches that project's records
 * for one collection. Fetched as the *user*, so PocketBase's project-scoped rule
 * is the access control — nothing here runs with admin rights.
 *
 * Deliberately does not catch: a failed fetch should reach the segment's
 * error.tsx rather than render an empty table that reads as "no records".
 */
export async function loadModuleData<K extends CollectionName>(
  collection: K,
  options: { sort?: string } = {},
): Promise<{ activeProject: Project | null; items: RecordOf<K>[] }> {
  const session = await requireSession();
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());

  if (!activeProject) return { activeProject: null, items: [] };

  const items = await pb.collection(collection).getFullList<RecordOf<K>>({
    // pb.filter() escapes the value — never interpolate into a filter string.
    filter: pb.filter("project = {:project}", { project: activeProject.id }),
    sort: options.sort ?? "-created",
  });

  return { activeProject, items };
}
