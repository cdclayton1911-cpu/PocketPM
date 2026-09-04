import { ProjectTeamClient } from "@/components/project-team/ProjectTeamClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function TeamPage() {
  const { activeProject, items } = await loadModuleData("project_roles", { sort: "role" });
  if (!activeProject) return <NoProject what="project team" />;
  // `members` is the access list; roles are separate. Passed so the table can
  // show the difference rather than implying a role grants entry.
  return (
    <ProjectTeamClient
      projectId={activeProject.id}
      initialData={items}
      memberIds={activeProject.members ?? []}
    />
  );
}
