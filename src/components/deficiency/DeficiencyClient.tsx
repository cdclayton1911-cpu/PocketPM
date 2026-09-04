"use client";

import { AlertTriangle, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Deficiency, DeficiencySeverity, DeficiencyStatus } from "@/types";

import { DeficiencyDialog } from "./DeficiencyDialog";

export const deficiencyHooks = createCollectionHooks({
  collection: "deficiencies",
  label: "Deficiency",
  titleField: "def_number",
});

const SEVERITY_TONE: Record<DeficiencySeverity, BadgeTone> = {
  minor: "neutral",
  major: "warning",
  life_safety: "danger",
};

const STATUS_TONE: Record<DeficiencyStatus, BadgeTone> = {
  open: "info",
  in_progress: "warning",
  closed: "success",
  escalated: "danger",
  void: "neutral",
};

const FILTERS = [
  { value: "open", label: "Open only" },
  { value: "life_safety", label: "Life safety" },
  { value: "overdue", label: "Overdue" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const isOpen = (r: Deficiency) => r.status === "open" || r.status === "in_progress" || r.status === "escalated";

function isOverdue(r: Deficiency) {
  if (!isOpen(r)) return false;
  const days = daysUntil(r.due_date);
  return days !== null && days < 0;
}

/** Days a deficiency has been outstanding since it was logged. */
function daysOpen(r: Deficiency): number | null {
  if (!r.logged_date || !isOpen(r)) return null;
  const days = daysUntil(r.logged_date);
  return days === null ? null : Math.abs(days);
}

export function DeficiencyClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: Deficiency[];
}) {
  const query = deficiencyHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Deficiency | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "open") return data.filter(isOpen);
    if (filter === "overdue") return data.filter(isOverdue);
    if (filter === "life_safety") return data.filter((r) => r.severity === "life_safety");
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter(isOpen);
    // Life safety counts only open ones — a closed one is not an active risk.
    const lifeSafety = open.filter((r) => r.severity === "life_safety");
    const overdue = data.filter(isOverdue);
    const closed = data.filter((r) => r.status === "closed");
    return [
      { label: "Total open", value: open.length, tone: open.length ? ("warning" as const) : undefined },
      {
        label: "Life safety",
        value: lifeSafety.length,
        tone: lifeSafety.length ? ("danger" as const) : ("success" as const),
        sub: lifeSafety.length ? "Immediate action" : "None open",
      },
      { label: "Overdue", value: overdue.length, tone: overdue.length ? ("danger" as const) : undefined },
      { label: "Closed", value: closed.length, tone: "success" as const },
    ];
  }, [data]);

  const columns: Column<Deficiency>[] = [
    { key: "num", header: "DEF #", cell: (r) => <span className="font-mono text-xs">{r.def_number || "—"}</span> },
    { key: "desc", header: "Description", cell: (r) => r.description },
    { key: "location", header: "Location", cell: (r) => r.location || "—" },
    { key: "trade", header: "Trade", cell: (r) => r.trade || "—" },
    {
      key: "severity",
      header: "Severity",
      cell: (r) => (
        <StatusBadge tone={SEVERITY_TONE[r.severity] ?? "neutral"}>
          {r.severity === "life_safety" ? "Life safety" : humanizeStatus(r.severity)}
        </StatusBadge>
      ),
    },
    {
      key: "due",
      header: "Due",
      cell: (r) =>
        r.due_date ? (
          <span className={cn(isOverdue(r) && "font-bold text-danger")}>{r.due_date}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "days",
      header: "Days",
      align: "right",
      cell: (r) => {
        const days = daysOpen(r);
        if (days === null) return <span className="text-muted-foreground">—</span>;
        return <span className={cn(days > 7 && "font-bold text-danger")}>{days}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanizeStatus(r.status)}</StatusBadge>,
    },
    {
      key: "files",
      header: "Photos",
      cell: (r) =>
        r.photos?.length ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Paperclip className="size-3" aria-hidden />
            {r.photos.length}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
      title="Deficiency log"
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
      addLabel="Log deficiency"
      emptyIcon={AlertTriangle}
      emptyTitle="No deficiencies logged"
      emptyDescription="Log deficiencies found during follow-up inspections."
      // An open life-safety deficiency is a stop-work condition in CQM-C, so it
      // is tinted rather than left to be spotted in the severity column.
      rowClassName={(r) => cn(r.severity === "life_safety" && isOpen(r) && "bg-danger-subtle/40")}
    >
      <DeficiencyDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deficiency={editTarget}
      />
    </CollectionView>
  );
}
