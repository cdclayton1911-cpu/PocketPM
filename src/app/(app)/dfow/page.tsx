import { DfowClient } from "@/components/dfow/DfowClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function DfowPage() {
  const { activeProject, items } = await loadModuleData("dfow", { sort: "dfow_number" });
  if (!activeProject) return <NoProject what="DFOW register" />;
  return <DfowClient projectId={activeProject.id} initialData={items} />;
}
