// Server-only: reads across several collections for the dashboard views.
import "server-only";

import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { CollectionName, Project, RecordOf } from "@/types";

/**
 * Load several collections for one project in parallel.
 *
 * The dashboards derive everything from the module collections rather than
 * storing their own numbers. That means a stat can never disagree with the
 * module it summarises — there is one source of truth and the dashboard is a
 * read of it.
 *
 * A failing collection yields [] rather than rejecting the whole page: a
 * dashboard that renders eleven of twelve panels is far more useful than one
 * that shows an error because a single list was unavailable. Which ones failed
 * is returned so the UI can say so instead of implying "no data".
 */
export async function loadAggregate<K extends CollectionName>(
  collections: readonly K[],
): Promise<{
  activeProject: Project | null;
  data: { [P in K]: RecordOf<P>[] };
  failed: K[];
}> {
  const session = await requireSession();
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());

  // `unknown` first: Object.fromEntries widens to a string index signature,
  // which TypeScript will not narrow directly to the mapped type.
  const empty = Object.fromEntries(collections.map((c) => [c, []])) as unknown as {
    [P in K]: RecordOf<P>[];
  };

  if (!activeProject) return { activeProject: null, data: empty, failed: [] };

  const failed: K[] = [];
  const results = await Promise.all(
    collections.map(async (collection) => {
      try {
        const items = await pb.collection(collection).getFullList({
          filter: pb.filter("project = {:project}", { project: activeProject.id }),
        });
        return [collection, items] as const;
      } catch {
        failed.push(collection);
        return [collection, []] as const;
      }
    }),
  );

  return {
    activeProject,
    data: Object.fromEntries(results) as { [P in K]: RecordOf<P>[] },
    failed,
  };
}
