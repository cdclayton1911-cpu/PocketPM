import { NoProject } from "@/components/shared/NoProject";
import { GanttChart, type GanttEdge, type GanttRow } from "@/components/schedule/GanttChart";
import { readActiveProjectId, resolveActiveProject } from "@/lib/active-project";
import { createClient } from "@/lib/pocketbase";
import { analyzeSchedule } from "@/lib/schedule/analyze";
import { requireSession } from "@/lib/session";
import type { Project, ScheduleItem } from "@/types";

export default async function GanttPage() {
  const session = await requireSession("/schedule/gantt");
  const pb = createClient(session.token);

  const projects = await pb.collection("projects").getFullList<Project>({ sort: "-created" });
  const activeProject = resolveActiveProject(projects, await readActiveProjectId());
  if (!activeProject) return <NoProject what="the schedule chart" />;

  // analyzeSchedule supplies the calendar and, more importantly, the freshness
  // marker. Per docs/schedule-plan.md the chart may use the saved CPM columns
  // ONLY when that says fresh — a critical path drawn from a stale cache is
  // wrong without looking wrong.
  const analysis = await analyzeSchedule(pb, activeProject.id);

  const items = await pb.collection("schedule_items").getFullList<ScheduleItem>({
    filter: pb.filter("project = {:p}", { p: activeProject.id }),
    sort: "sort_order",
  });
  const relationships = await pb.collection("schedule_relationships").getFullList({
    filter: pb.filter("project = {:p}", { p: activeProject.id }),
  });

  const rows: GanttRow[] = items.map((i) => ({
    id: i.id,
    activity_id: i.activity_id ?? "",
    activity: i.activity ?? "",
    target_start: i.target_start ?? "",
    target_finish: i.target_finish ?? "",
    actual_start: i.actual_start ?? "",
    actual_finish: i.actual_finish ?? "",
    pct_complete: Number(i.pct_complete ?? 0),
    is_milestone: i.activity_type === "start_milestone" || i.activity_type === "finish_milestone",
    is_critical: Boolean((i as unknown as { is_critical?: boolean }).is_critical),
    sort_order: Number(i.sort_order ?? 0),
    cpm_early_start: i.cpm_early_start ?? "",
  }));

  const edges: GanttEdge[] = relationships.map((r) => ({
    predecessor: r.predecessor as string,
    successor: r.successor as string,
    type: r.type as GanttEdge["type"],
    lag_days: Number(r.lag_days ?? 0),
  }));

  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-base font-semibold">Schedule</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          {activeProject.name}. Read-only — this mirrors the imported schedule rather than editing
          it.
        </p>
      </div>
      <GanttChart
        rows={rows}
        edges={edges}
        calendar={analysis.calendar}
        projectStart={activeProject.start_date ?? ""}
        projectEnd={activeProject.end_date ?? ""}
        freshness={analysis.freshness.state}
      />
    </div>
  );
}
