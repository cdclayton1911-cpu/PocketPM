"use client";

import { ClipboardCheck, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { PunchListItem, PunchListItemPriority, PunchListItemStatus } from "@/types";

import { PunchListDialog } from "./PunchListDialog";

export const punchHooks = createCollectionHooks({
  collection: "punch_list",
  path: "punch-list",
  label: "Punch item",
  titleField: "item_number",
});

const PRIORITY_TONE: Record<PunchListItemPriority, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  life_safety: "danger",
};

const STATUS_TONE: Record<PunchListItemStatus, BadgeTone> = {
  open: "info",
  in_progress: "warning",
  complete: "success",
  void: "neutral",
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "life_safety", label: "Life safety" },
  { value: "overdue", label: "Overdue" },
  { value: "complete", label: "Complete" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

function isOpen(row: PunchListItem) {
  return row.status === "open" || row.status === "in_progress";
}

function isOverdue(row: PunchListItem) {
  if (!isOpen(row)) return false;
  const days = daysUntil(row.due_date);
  return days !== null && days < 0;
}

export function PunchListClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: PunchListItem[];
}) {
  const query = punchHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PunchListItem | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "open") return data.filter(isOpen);
    if (filter === "overdue") return data.filter(isOverdue);
    if (filter === "life_safety") return data.filter((r) => r.priority === "life_safety");
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter(isOpen);
    const lifeSafety = data.filter((r) => r.priority === "life_safety" && isOpen(r));
    const overdue = data.filter(isOverdue);
    const complete = data.filter((r) => r.status === "complete");
    return [
      { label: "Total items", value: data.length },
      { label: "Open", value: open.length, tone: "warning" as const },
      {
        label: "Life safety",
        value: lifeSafety.length,
        tone: lifeSafety.length ? ("danger" as const) : undefined,
        sub: lifeSafety.length ? "Immediate action" : undefined,
      },
      { label: "Complete", value: complete.length, tone: "success" as const, sub: `${overdue.length} overdue` },
    ];
  }, [data]);

  const columns: Column<PunchListItem>[] = [
    { key: "num", header: "#", cell: (r) => <span className="font-mono text-xs">{r.item_number || "—"}</span> },
    { key: "desc", header: "Description", cell: (r) => r.description },
    { key: "location", header: "Location", cell: (r) => r.location || "—" },
    { key: "trade", header: "Trade", cell: (r) => r.trade || "—" },
    {
      key: "priority",
      header: "Priority",
      cell: (r) => (
        <StatusBadge tone={PRIORITY_TONE[r.priority] ?? "neutral"}>
          {r.priority === "life_safety" ? "Life safety" : humanizeStatus(r.priority)}
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
      title="Punch list"
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
      addLabel="Add item"
      emptyIcon={ClipboardCheck}
      emptyTitle="No punch items yet"
      emptyDescription="Log deficiencies found during closeout walks."
      // Life-safety items are tinted so they cannot be missed in a long list.
      rowClassName={(r) => cn(r.priority === "life_safety" && isOpen(r) && "bg-danger-subtle/40")}
    >
      <PunchListDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} item={editTarget} />
    </CollectionView>
  );
}
