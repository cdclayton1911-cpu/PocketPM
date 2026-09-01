import { AssistantClient } from "@/components/assistant/AssistantClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function AssistantPage() {
  const { activeProject } = await loadModuleData("ai_sessions");
  if (!activeProject) return <NoProject what="PM assistant" />;
  return <AssistantClient project={activeProject} />;
}
