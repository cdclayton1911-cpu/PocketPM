import { PayApplicationClient } from "@/components/pay-application/PayApplicationClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function PayApplicationPage() {
  const { activeProject, items } = await loadModuleData("pay_applications", { sort: "-app_number" });
  if (!activeProject) return <NoProject what="pay applications" />;
  return <PayApplicationClient projectId={activeProject.id} initialData={items} />;
}
