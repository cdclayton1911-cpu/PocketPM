import { NoProject } from "@/components/shared/NoProject";
import { PrecedenceClient } from "@/components/precedence/PrecedenceClient";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Project } from "@/types";

export default async function PrecedencePage() {
  const session = await requireSession("/settings/precedence");
  const pb = createClient(session.token);
  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="the order of precedence" />;
  return <PrecedenceClient projectId={activeProject.id} projectName={activeProject.name} />;
}
