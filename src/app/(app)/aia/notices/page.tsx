import { AiaNoticesClient } from "@/components/aia-notices/AiaNoticesClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function AiaNoticesPage() {
  const { activeProject, items } = await loadModuleData("aia_notices", { sort: "notice_deadline" });
  if (!activeProject) return <NoProject what="contract notices" />;
  return <AiaNoticesClient projectId={activeProject.id} initialData={items} />;
}
