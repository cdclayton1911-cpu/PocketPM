import { SubcontractsClient } from "@/components/aia-subcontracts/SubcontractsClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

/**
 * A401 subcontract view over the `subcontractors` collection.
 *
 * There is no separate subcontracts collection — a subcontract IS a
 * subcontractor's A401 status, value, and flow-down state. Duplicating those
 * fields into a second collection would create two records that disagree.
 */
export default async function SubcontractsPage() {
  const { activeProject, items } = await loadModuleData("subcontractors", { sort: "company_name" });
  if (!activeProject) return <NoProject what="subcontracts" />;
  return <SubcontractsClient projectId={activeProject.id} initialData={items} />;
}
