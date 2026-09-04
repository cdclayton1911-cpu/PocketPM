"use client";

import { HardHat, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { SafetyObservation, SafetyObservationSeverity, SafetyObservationStatus } from "@/types";

import { OshaDialog } from "./OshaDialog";

export const safetyHooks = createCollectionHooks({
  collection: "safety_observations",
  path: "safety-observations",
  label: "Observation",
});

const SEVERITY_TONE: Record<SafetyObservationSeverity, BadgeTone> = {
  minor: "neutral",
  moderate: "warning",
  serious: "danger",
  critical: "danger",
};

const STATUS_TONE: Record<SafetyObservationStatus, BadgeTone> = {
  open: "info",
  corrected: "warning",
  closed: "success",
  escalated: "danger",
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "recordable", label: "Recordable" },
  { value: "near_miss", label: "Near miss" },
  { value: "toolbox_talk", label: "Toolbox talks" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const isOpen = (r: SafetyObservation) => r.status === "open" || r.status === "escalated";

export function OshaClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: SafetyObservation[];
}) {
  const query = safetyHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SafetyObservation | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "open") return data.filter(isOpen);
    return data.filter((r) => r.type === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter(isOpen);
    const recordables = data.filter((r) => r.type === "recordable");
    const talks = data.filter((r) => r.type === "toolbox_talk");

    /**
     * Days since the most recent recordable — the headline safety metric.
     *
     * Null when there has never been one, which is different from zero and must
     * not be displayed as "0 days since". A site with no recordables has not
     * just had one.
     */
    const lastRecordable = recordables
      .map((r) => daysUntil(r.obs_date))
      .filter((d): d is number => d !== null)
      .sort((a, b) => b - a)[0];
    const daysSince = lastRecordable === undefined ? null : Math.abs(lastRecordable);

    return [
      {
        label: "Days since recordable",
        value: daysSince === null ? "—" : daysSince,
        tone: daysSince === null ? undefined : daysSince > 30 ? ("success" as const) : ("caution" as const),
        sub: daysSince === null ? "No recordables logged" : `${recordables.length} total`,
      },
      { label: "Open observations", value: open.length, tone: open.length ? ("warning" as const) : undefined },
      {
        label: "Recordables",
        value: recordables.length,
        tone: recordables.length ? ("danger" as const) : ("success" as const),
      },
      { label: "Toolbox talks", value: talks.length, sub: "Logged this project" },
    ];
  }, [data]);

  const columns: Column<SafetyObservation>[] = [
    { key: "date", header: "Date", cell: (r) => r.obs_date || "—" },
    { key: "desc", header: "Observation", cell: (r) => r.description },
    { key: "location", header: "Location", cell: (r) => r.location || "—" },
    { key: "trade", header: "Trade", cell: (r) => r.trade || "—" },
    { key: "type", header: "Type", cell: (r) => humanizeStatus(r.type) },
    {
      key: "severity",
      header: "Severity",
      cell: (r) => (
        <StatusBadge tone={SEVERITY_TONE[r.severity] ?? "neutral"}>{humanizeStatus(r.severity)}</StatusBadge>
      ),
    },
    {
      key: "osha",
      header: "29 CFR ref.",
      cell: (r) => <span className="font-mono text-xs">{r.osha_reference || "—"}</span>,
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
      title="Safety observations"
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
      addLabel="Log observation"
      emptyIcon={HardHat}
      emptyTitle="No observations logged"
      emptyDescription="Log safety observations, near misses, and toolbox talks."
      rowClassName={(r) =>
        cn((r.severity === "critical" || r.type === "recordable") && isOpen(r) && "bg-danger-subtle/40")
      }
    >
      <OshaDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} observation={editTarget} />
    </CollectionView>
  );
}
