import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Project } from "@/types";

/**
 * Shell for every module route.
 *
 * `proxy.ts` already redirects unauthenticated requests, but that check only
 * decodes the token's expiry without verifying the signature. requireSession()
 * is the authoritative one: it asks PocketBase to validate the token, so a
 * forged or revoked token gets no further than here.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  // Fetched as the user, so PocketBase's owner/members rule does the filtering.
  // The shell can only ever show projects this user belongs to.
  let projects: Project[] = [];
  try {
    const pb = createClient(session.token);
    projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  } catch {
    // A failed project fetch should not blank the whole app — the shell renders
    // with an empty switcher and the page below still works.
    projects = [];
  }

  // The cookie is a hint, not an authority: resolveActiveProject ignores it if
  // it names a project this user cannot see.
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projects={projects} activeProject={activeProject} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} />
        <main className="flex-1 overflow-y-auto bg-background p-4">{children}</main>
      </div>
    </div>
  );
}
