import { AiaDashboardView } from "@/components/aia-dashboard/AiaDashboardView";
import { NoProject } from "@/components/shared/NoProject";
import { loadAggregate } from "@/lib/aggregate";

const COLLECTIONS = ["aia_notices", "change_orders", "pay_applications", "subcontractors"] as const;

export default async function AiaDashboardPage() {
  const { activeProject, data, failed } = await loadAggregate(COLLECTIONS);
  if (!activeProject) return <NoProject what="contract dashboard" />;
  return <AiaDashboardView project={activeProject} data={data} failed={failed} />;
}
