import { NoProject } from "@/components/shared/NoProject";
import { SubmittalsClient } from "@/components/submittals/SubmittalsClient";
import { loadModuleData } from "@/lib/module-page";

export default async function SubmittalsPage() {
  const { activeProject, items } = await loadModuleData("submittals");
  if (!activeProject) return <NoProject what="submittal register" />;
  return <SubmittalsClient projectId={activeProject.id} initialData={items} />;
}
