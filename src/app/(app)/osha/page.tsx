import { OshaClient } from "@/components/osha/OshaClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function OshaPage() {
  const { activeProject, items } = await loadModuleData("safety_observations", { sort: "-obs_date" });
  if (!activeProject) return <NoProject what="safety log" />;
  return <OshaClient projectId={activeProject.id} initialData={items} />;
}
