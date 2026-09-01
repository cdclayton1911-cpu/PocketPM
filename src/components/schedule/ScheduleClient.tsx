"use client";

import { CalendarDays, Diamond } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { ScheduleItem, ScheduleItemStatus } from "@/types";

import { ScheduleDialog } from "./ScheduleDialog";

export const scheduleHooks = createCollectionHooks({
  collection: "schedule_items",
  path: "schedule-items",
  label: "Activity",
  titleField: "activity",
});

const STATUS_TONE: Record<ScheduleItemStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  complete: "success",
  at_risk: "warning",
  delayed: "danger",
  critical: "danger",
};

const FILTERS = [
  { value: "all", label: "All activities" },
  { value: "milestones", label: "Milestones" },
  { value: "slipping", label: "Slipping" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/**
 * Days the forecast finish is beyond the planned finish.
 *
 * Positive means late. Returns null when either date is missing — an activity
 * with no forecast is not "on time", it is simply unforecast, and showing 0
 * would imply a confidence that does not exist.
 */
function slipDays(row: ScheduleItem): number | null {
  if (!row.planned_finish || !row.forecast_finish) return null;
  const planned = daysUntil(row.planned_finish);
  const forecast = daysUntil(row.forecast_finish);
  if (planned === null || forecast === null) return null;
  return forecast - planned;
}

export function ScheduleClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: ScheduleItem[];
}) {
  const query = scheduleHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleItem | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "milestones") return data.filter((r) => r.is_milestone);
    if (filter === "slipping") return data.filter((r) => (slipDays(r) ?? 0) > 0);
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const complete = data.filter((r) => r.status === "complete");
    const critical = data.filter((r) => r.status === "critical" || r.status === "delayed");
    const slipping = data.filter((r) => (slipDays(r) ?? 0) > 0);
    const worstSlip = slipping.reduce((max, r) => Math.max(max, slipDays(r) ?? 0), 0);
    return [
      { label: "Activities", value: data.length, sub: `${data.filter((r) => r.is_milestone).length} milestones` },
      { label: "Complete", value: complete.length, tone: "success" as const },
      {
        label: "At risk",
        value: critical.length,
        tone: critical.length ? ("danger" as const) : undefined,
      },
      {
        label: "Worst slip",
        value: worstSlip > 0 ? `${worstSlip}d` : "—",
        tone: worstSlip > 0 ? ("danger" as const) : ("success" as const),
        sub: slipping.length ? `${slipping.length} slipping` : "Nothing slipping",
      },
    ];
  }, [data]);

  const columns: Column<ScheduleItem>[] = [
    {
      key: "activity",
      header: "Activity",
      cell: (r) => (
        <span className={cn("flex items-center gap-1.5", r.is_milestone && "font-semibold")}>
          {r.is_milestone ? <Diamond className="size-3 shrink-0 text-primary" aria-label="Milestone" /> : null}
          {r.activity}
        </span>
      ),
    },
    { key: "start", header: "Planned start", cell: (r) => r.planned_start || "—" },
    { key: "finish", header: "Planned finish", cell: (r) => r.planned_finish || "—" },
    {
      key: "forecast",
      header: "Forecast",
      cell: (r) => {
        const slip = slipDays(r);
        if (!r.forecast_finish) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn(slip !== null && slip > 0 && "font-bold text-danger")}>
            {r.forecast_finish}
            {slip !== null && slip > 0 ? ` (+${slip}d)` : ""}
          </span>
        );
      },
    },
    {
      key: "pct",
      header: "%",
      align: "right",
      cell: (r) => (r.pct_complete ? `${r.pct_complete}%` : "—"),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanizeStatus(r.status)}</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setEditTarget(r);
            setDialogOpen(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <CollectionView
      title="CPM schedule"
      query={query}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      stats={stats}
      filters={FILTERS}
      filter={filter}
      onFilterChange={setFilter}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="Add activity"
      emptyIcon={CalendarDays}
      emptyTitle="No activities yet"
      emptyDescription="Add CPM activities to track planned against forecast dates."
      rowClassName={(r) => cn((slipDays(r) ?? 0) > 0 && "bg-danger-subtle/30")}
    >
      <ScheduleDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} item={editTarget} />
    </CollectionView>
  );
}
