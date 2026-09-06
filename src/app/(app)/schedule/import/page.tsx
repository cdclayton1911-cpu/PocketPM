import { NoProject } from "@/components/shared/NoProject";
import { ScheduleImportClient } from "@/components/schedule/ScheduleImportClient";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { requireSession } from "@/lib/session";
import type { Project } from "@/types";

export default async function ScheduleImportPage() {
  const session = await requireSession("/schedule/import");
  const pb = createClient(session.token);
  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="schedule import" />;
  return <ScheduleImportClient />;
}
