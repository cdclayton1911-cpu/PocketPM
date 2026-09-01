import { EstimatingClient } from "@/components/estimating/EstimatingClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function EstimatingPage() {
  // The project supplies the default location; budget_items are not an input.
  const { activeProject } = await loadModuleData("budget_items");
  if (!activeProject) return <NoProject what="estimating engine" />;
  return <EstimatingClient project={activeProject} />;
}
