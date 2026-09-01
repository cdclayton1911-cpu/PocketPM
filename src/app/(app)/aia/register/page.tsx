import { RegisterClient } from "@/components/aia-register/RegisterClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function RegisterPage() {
  // ai_sessions is scoped to the signed-in user by its own rules, so this
  // returns only their previous reviews.
  const { activeProject, items } = await loadModuleData("ai_sessions");
  if (!activeProject) return <NoProject what="risk register" />;
  return <RegisterClient project={activeProject} history={items} />;
}
