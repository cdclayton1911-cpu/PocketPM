import { NoProject } from "@/components/shared/NoProject";
import { WorkflowSettingsClient } from "@/components/workflows/WorkflowSettingsClient";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Project, User } from "@/types";

export default async function WorkflowSettingsPage() {
  const session = await requireSession("/settings/workflows");
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="workflow templates" />;

  // The user picker can only offer people the narrowed users.listRule lets the
  // caller see — which, since d6a549d, is exactly those sharing a project.
  const users = await pb.collection("users").getFullList<User>({ sort: "name" });
  const memberIds = new Set([activeProject.owner, ...(activeProject.members ?? [])]);

  return (
    <WorkflowSettingsClient
      projectId={activeProject.id}
      projectName={activeProject.name}
      isOwner={activeProject.owner === session.user.id}
      members={users
        .filter((u) => memberIds.has(u.id))
        .map((u) => ({ id: u.id, name: u.name || u.email || u.id }))}
    />
  );
}
