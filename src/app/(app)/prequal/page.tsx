import { NoProject } from "@/components/shared/NoProject";
import { PrequalClient } from "@/components/prequal/PrequalClient";
import { loadModuleData } from "@/lib/module-page";

export default async function PrequalPage() {
  const { activeProject, items } = await loadModuleData("subcontractors", { sort: "company_name" });
  if (!activeProject) return <NoProject what="prequalification builder" />;
  return <PrequalClient subcontractors={items} />;
}
