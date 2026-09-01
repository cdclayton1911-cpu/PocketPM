import { PunchListClient } from "@/components/punch-list/PunchListClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function PunchListPage() {
  const { activeProject, items } = await loadModuleData("punch_list");
  if (!activeProject) return <NoProject what="punch list" />;
  return <PunchListClient projectId={activeProject.id} initialData={items} />;
}
