import { BudgetClient } from "@/components/budget/BudgetClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function BudgetPage() {
  const { activeProject, items } = await loadModuleData("budget_items", {
    sort: "sort_order,csi_division",
  });
  if (!activeProject) return <NoProject what="budget" />;
  return (
    <BudgetClient
      projectId={activeProject.id}
      initialData={items}
      contractValue={activeProject.contract_value}
    />
  );
}
