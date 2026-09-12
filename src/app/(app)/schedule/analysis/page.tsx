import { NoProject } from "@/components/shared/NoProject";
import { ScheduleAnalysisClient } from "@/components/schedule/ScheduleAnalysisClient";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { analyzeSchedule } from "@/lib/schedule/analyze";
import { requireSession } from "@/lib/session";
import type { Project, ScheduleItem } from "@/types";

export default async function ScheduleAnalysisPage() {
  const session = await requireSession("/schedule/analysis");
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="schedule analysis" />;

  // Computed fresh, not read from the cached columns — those are stale the
  // moment a duration changes.
  const analysis = await analyzeSchedule(pb, activeProject.id);

  if (!analysis.outcome.ok) {
    return (
      <ScheduleAnalysisClient
        rows={[]}
        divergence={null}
        projectFinish={null}
        error={analysis.outcome.error}
        freshness={analysis.freshness.state}
        computedAt={analysis.computedAt}
        calendarSource={analysis.calendarSource}
        dataDate={analysis.dataDate}
      />
    );
  }

  const items = await pb.collection("schedule_items").getFullList<ScheduleItem>({
    filter: pb.filter("project = {:p}", { p: activeProject.id }),
    sort: "sort_order",
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const rows = analysis.outcome.report.activities.map((a) => {
    const item = byId.get(a.id);
    return {
      ...a,
      activity_id: item?.activity_id ?? a.id,
      activity: item?.activity ?? "",
      imported_start: item?.target_start || null,
      imported_finish: item?.target_finish || null,
    };
  });

  return (
    <ScheduleAnalysisClient
      rows={rows}
      divergence={analysis.divergence}
      projectFinish={analysis.outcome.report.projectFinish}
      error={null}
      freshness={analysis.freshness.state}
      computedAt={analysis.computedAt}
      calendarSource={analysis.calendarSource}
      dataDate={analysis.dataDate}
    />
  );
}
