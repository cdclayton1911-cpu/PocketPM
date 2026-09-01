import { NoProject } from "@/components/shared/NoProject";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import { loadModuleData } from "@/lib/module-page";

export default async function SchedulePage() {
  const { activeProject, items } = await loadModuleData("schedule_items", {
    sort: "sort_order,planned_start",
  });
  if (!activeProject) return <NoProject what="schedule" />;
  return <ScheduleClient projectId={activeProject.id} initialData={items} />;
}
