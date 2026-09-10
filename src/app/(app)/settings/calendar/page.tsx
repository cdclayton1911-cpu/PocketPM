import { NoProject } from "@/components/shared/NoProject";
import { CalendarSettingsClient } from "@/components/schedule/CalendarSettingsClient";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { normalizeCalendar } from "@/lib/schedule/calendar";
import { requireSession } from "@/lib/session";
import type { Project, ScheduleItem } from "@/types";

export default async function CalendarSettingsPage() {
  const session = await requireSession("/settings/calendar");
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="the working calendar" />;

  // The furthest date the schedule actually reaches, which is what the holiday
  // coverage warning is measured against — not the project's nominal end date,
  // since a slipped schedule runs past it.
  const items = await pb.collection("schedule_items").getFullList<ScheduleItem>({
    filter: pb.filter("project = {:p}", { p: activeProject.id }),
  });
  const scheduleEnds = items
    .flatMap((i) => [i.target_finish, i.forecast_finish, i.actual_finish])
    .filter((d): d is string => Boolean(d))
    .reduce((max, d) => (d > max ? d : max), activeProject.end_date || "");

  return (
    <CalendarSettingsClient
      projectId={activeProject.id}
      projectName={activeProject.name}
      isOwner={activeProject.owner === session.user.id}
      initial={normalizeCalendar({
        work_days: activeProject.work_days as number[] | undefined,
        holidays: activeProject.holidays as { date: string; label?: string }[] | undefined,
      })}
      projectStart={activeProject.start_date || ""}
      projectEnd={activeProject.end_date || ""}
      scheduleEnds={scheduleEnds}
    />
  );
}
