import { DailyLogClient } from "@/components/daily-log/DailyLogClient";
import { NoProject } from "@/components/shared/NoProject";
import { loadModuleData } from "@/lib/module-page";

export default async function DailyLogPage() {
  // By log_date, not `created`: a log back-filled today for last Friday belongs
  // on Friday.
  const { activeProject, items } = await loadModuleData("daily_logs", { sort: "-log_date" });
  if (!activeProject) return <NoProject what="daily log" />;
  return <DailyLogClient projectId={activeProject.id} initialData={items} />;
}
