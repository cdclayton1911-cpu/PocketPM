import { DeficiencyClient } from "@/components/deficiency/DeficiencyClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function DeficiencyPage() {
  const { activeProject, items } = await loadModuleData("deficiencies");
  if (!activeProject) return <NoProject what="deficiency tracker" />;
  return <DeficiencyClient projectId={activeProject.id} initialData={items} />;
}
