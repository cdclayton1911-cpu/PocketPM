import { SafetyPlansClient } from "@/components/safety-plans/SafetyPlansClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function SafetyPlansPage() {
  // Only the project itself is needed; safety_observations has its own module.
  const { activeProject } = await loadModuleData("safety_observations");
  if (!activeProject) return <NoProject what="safety plan generator" />;
  return <SafetyPlansClient project={activeProject} />;
}
