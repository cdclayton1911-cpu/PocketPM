import { Building2 } from "lucide-react";

import { RegistryClient } from "@/components/registry/RegistryClient";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Project, Subcontractor } from "@/types";

/**
 * Reference module shape: server component fetches, client component renders.
 *
 * The fetch runs as the user, so PocketBase's project-scoped rule is the access
 * control. The result is handed to the client as `initialData`, so the first
 * paint has real rows rather than a spinner.
 */
export default async function RegistryPage() {
  const session = await requireSession();
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());

  if (!activeProject) {
    return (
      <Card className="rounded-r12">
        <EmptyState
          icon={Building2}
          title="No project selected"
          description="Create or select a project in the sidebar to start its subcontractor registry."
        />
      </Card>
    );
  }

  // Not wrapped in try/catch: a failure here should hit error.tsx rather than
  // render an empty table that looks like "no subcontractors".
  const subcontractors = await pb.collection("subcontractors").getFullList<Subcontractor>({
    filter: pb.filter("project = {:project}", { project: activeProject.id }),
    sort: "-created",
  });

  return <RegistryClient projectId={activeProject.id} initialData={subcontractors} />;
}
