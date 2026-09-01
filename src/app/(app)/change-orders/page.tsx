import { ChangeOrdersClient } from "@/components/change-orders/ChangeOrdersClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function ChangeOrdersPage() {
  const { activeProject, items } = await loadModuleData("change_orders", { sort: "co_number" });
  if (!activeProject) return <NoProject what="change orders" />;
  return (
    <ChangeOrdersClient
      projectId={activeProject.id}
      initialData={items}
      contractValue={activeProject.contract_value}
    />
  );
}
