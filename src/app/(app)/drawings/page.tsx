import { DrawingsClient } from "@/components/drawings/DrawingsClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function DrawingsPage() {
  const { activeProject, items } = await loadModuleData("drawings", { sort: "sheet_number" });
  if (!activeProject) return <NoProject what="drawing register" />;
  return <DrawingsClient projectId={activeProject.id} initialData={items} />;
}
