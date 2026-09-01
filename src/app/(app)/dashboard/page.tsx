import { DashboardView } from "@/components/dashboard/DashboardView";
import { NoProject } from "@/components/shared/NoProject";
import { loadAggregate } from "@/lib/aggregate";

const COLLECTIONS = [
  "rfis",
  "submittals",
  "deficiencies",
  "change_orders",
  "subcontractors",
  "schedule_items",
  "aia_notices",
] as const;

export default async function DashboardPage() {
  const { activeProject, data, failed } = await loadAggregate(COLLECTIONS);
  if (!activeProject) return <NoProject what="dashboard" />;
  return <DashboardView project={activeProject} data={data} failed={failed} />;
}
