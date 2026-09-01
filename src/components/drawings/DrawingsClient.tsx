"use client";

import { FileWarning, Ruler } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { cn } from "@/lib/utils";
import type { Drawing, DrawingStatus } from "@/types";

import { DrawingDialog } from "./DrawingDialog";

export const drawingHooks = createCollectionHooks({
  collection: "drawings",
  label: "Drawing",
  titleField: "sheet_number",
});

const STATUS_TONE: Record<DrawingStatus, BadgeTone> = {
  current: "success",
  superseded: "neutral",
  voided: "danger",
  addendum: "info",
};

const FILTERS = [
  { value: "current", label: "Current set" },
  { value: "addendum", label: "Addenda" },
  { value: "superseded", label: "Superseded" },
  { value: "all", label: "All sheets" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export function DrawingsClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: Drawing[];
}) {
  const query = drawingHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("current");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Drawing | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const current = data.filter((r) => r.status === "current");
    const superseded = data.filter((r) => r.status === "superseded");
    const disciplines = new Set(data.map((r) => r.discipline).filter(Boolean));
    // Highest revision present, as a proxy for the set's revision level.
    const revisions = data
      .map((r) => Number.parseInt(r.revision, 10))
      .filter((n) => Number.isFinite(n));
    const latestRev = revisions.length ? Math.max(...revisions) : null;
    return [
      { label: "Sheets", value: data.length, sub: `${disciplines.size} disciplines` },
      { label: "Current", value: current.length, tone: "success" as const },
      { label: "Superseded", value: superseded.length, tone: superseded.length ? ("caution" as const) : undefined },
      { label: "Latest revision", value: latestRev === null ? "—" : `Rev ${latestRev}` },
    ];
  }, [data]);

  const columns: Column<Drawing>[] = [
    { key: "sheet", header: "Sheet", cell: (r) => <span className="font-mono text-xs font-semibold">{r.sheet_number}</span> },
    { key: "title", header: "Title", cell: (r) => r.title },
    { key: "discipline", header: "Discipline", cell: (r) => r.discipline || "—" },
    { key: "rev", header: "Rev", align: "right", cell: (r) => r.revision || "—" },
    { key: "date", header: "Rev date", cell: (r) => r.rev_date || "—" },
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
      title="Drawing register"
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
      addLabel="Add sheet"
      emptyIcon={Ruler}
      emptyTitle="No drawings registered"
      emptyDescription="Register sheets to track revisions and which set is current."
      rowClassName={(r) => cn(r.status === "voided" && "opacity-55")}
      insights={
        // Stated plainly rather than shown as a disabled upload button that
        // looks like it should work.
        <div className="flex items-start gap-2 rounded-r8 border border-border bg-secondary px-3 py-2.5 text-[13px] text-muted-foreground">
          <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This register tracks sheet metadata. PDF upload is not built yet — it needs a
            multipart upload route, which the JSON CRUD layer does not cover.
          </span>
        </div>
      }
    >
      <DrawingDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} drawing={editTarget} />
    </CollectionView>
  );
}
