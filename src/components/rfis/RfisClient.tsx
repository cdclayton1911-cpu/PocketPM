"use client";

import { HelpCircle, Layers } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { RevisionsDialog } from "@/components/revisions/RevisionsDialog";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Rfi, RfiStatus } from "@/types";

import { RfiDialog } from "./RfiDialog";

export const rfiHooks = createCollectionHooks({
  collection: "rfis",
  label: "RFI",
  titleField: "rfi_number",
});

const STATUS_TONE: Record<RfiStatus, BadgeTone> = {
  draft: "neutral",
  open: "info",
  answered: "success",
  closed: "success",
  void: "neutral",
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Open past its due date. The prototype's headline metric. */
function isOverdue(rfi: Rfi): boolean {
  if (rfi.status !== "open" && rfi.status !== "draft") return false;
  const days = daysUntil(rfi.due_date);
  return days !== null && days < 0;
}

/** How long an open RFI has been outstanding. */
function daysOpen(rfi: Rfi): number | null {
  if (!rfi.submitted_date) return null;
  const days = daysUntil(rfi.submitted_date);
  return days === null ? null : Math.abs(days);
}

export function RfisClient({ projectId, initialData }: { projectId: string; initialData: Rfi[] }) {
  const query = rfiHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revisionsFor, setRevisionsFor] = useState<{ id: string; label: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Rfi | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "overdue") return data.filter(isOverdue);
    if (filter === "open") return data.filter((r) => r.status === "open" || r.status === "draft");
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter((r) => r.status === "open" || r.status === "draft");
    const overdue = data.filter(isOverdue);
    const costImpact = data.filter((r) => r.cost_impact === "confirmed");
    const totalCost = costImpact.reduce((sum, r) => sum + (r.cost_amount || 0), 0);
    return [
      { label: "Total RFIs", value: data.length },
      { label: "Open", value: open.length, tone: "warning" as const },
      { label: "Overdue", value: overdue.length, tone: overdue.length ? ("danger" as const) : undefined },
      {
        label: "Cost impact",
        value: totalCost > 0 ? `$${totalCost.toLocaleString()}` : "—",
        sub: `${costImpact.length} confirmed`,
      },
    ];
  }, [data]);

  const columns: Column<Rfi>[] = [
    { key: "num", header: "RFI #", cell: (r) => <span className="font-mono text-xs">{r.rfi_number}</span> },
    { key: "subject", header: "Subject", cell: (r) => r.subject },
    { key: "drawing", header: "Drawing", cell: (r) => <span className="font-mono text-xs">{r.drawing || "—"}</span> },
    {
      key: "ball",
      header: "Ball in court",
      cell: (r) => (
        <span className={cn(isOverdue(r) && "font-semibold text-danger")}>{r.ball_in_court || "—"}</span>
      ),
    },
    { key: "submitted", header: "Submitted", cell: (r) => r.submitted_date || "—" },
    {
      key: "days",
      header: "Days open",
      align: "right",
      cell: (r) => {
        const days = daysOpen(r);
        if (days === null || r.status === "closed" || r.status === "answered") {
          return <span className="text-muted-foreground">—</span>;
        }
        return <span className={cn(days > 14 && "font-bold text-danger")}>{days}</span>;
      },
    },
    {
      key: "cost",
      header: "Cost impact",
      align: "right",
      cell: (r) =>
        r.cost_amount ? `$${r.cost_amount.toLocaleString()}` : humanizeStatus(r.cost_impact || "unknown"),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        isOverdue(r) ? (
          <StatusBadge tone="danger">Overdue</StatusBadge>
        ) : (
          <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanizeStatus(r.status)}</StatusBadge>
        ),
    },
    {
      key: "revisions",
      header: "Revisions",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setRevisionsFor({ id: r.id, label: r.rfi_number })}
        >
          <Layers className="size-3.5" aria-hidden /> History
        </Button>
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
      title="RFI log"
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
      addLabel="New RFI"
      emptyIcon={HelpCircle}
      emptyTitle="No RFIs yet"
      emptyDescription="Raise an RFI when a drawing or spec needs clarification."
      rowClassName={(r) => cn(isOverdue(r) && "bg-danger-subtle/40")}
    >
      <RfiDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} rfi={editTarget} />
      {revisionsFor ? (
        <RevisionsDialog
          parentType="rfi"
          parentId={revisionsFor.id}
          parentLabel={revisionsFor.label}
          open
          onOpenChange={(open) => !open && setRevisionsFor(null)}
        />
      ) : null}
    </CollectionView>
  );
}
