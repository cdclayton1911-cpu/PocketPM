import { RfisClient } from "@/components/rfis/RfisClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function RfisPage() {
  const { activeProject, items } = await loadModuleData("rfis");
  if (!activeProject) return <NoProject what="RFI log" />;
  return <RfisClient projectId={activeProject.id} initialData={items} />;
}
