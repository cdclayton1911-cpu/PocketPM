"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { formatQualityScore } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Dfow, DfowPhase } from "@/types";

import { DfowDialog } from "./DfowDialog";

export const dfowHooks = createCollectionHooks({
  collection: "dfow",
  label: "DFOW",
  titleField: "dfow_number",
});

const PHASE_TONE: Record<DfowPhase, BadgeTone> = {
  not_started: "neutral",
  preparatory: "warning",
  initial: "info",
  follow_up: "teal",
  complete: "success",
};

/** CQM-C three-phase sequence, in order. */
const PHASE_ORDER: DfowPhase[] = ["not_started", "preparatory", "initial", "follow_up", "complete"];

const FILTERS = [
  { value: "all", label: "All DFOWs" },
  { value: "active", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "complete", label: "Complete" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export function DfowClient({ projectId, initialData }: { projectId: string; initialData: Dfow[] }) {
  const query = dfowHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Dfow | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "active") {
      return data.filter((r) => ["preparatory", "initial", "follow_up"].includes(r.phase));
    }
    return data.filter((r) => r.phase === filter);
  }, [data, filter]);

  /** Progress through the three phases, as the prototype's phase bars show. */
  const phaseProgress = useMemo(() => {
    const total = data.length;
    const reached = (phase: DfowPhase) => {
      const index = PHASE_ORDER.indexOf(phase);
      return data.filter((r) => PHASE_ORDER.indexOf(r.phase) >= index).length;
    };
    return [
      { label: "Preparatory complete", count: reached("initial"), total },
      { label: "Initial complete", count: reached("follow_up"), total },
      { label: "Fully closed", count: reached("complete"), total },
    ];
  }, [data]);

  const stats = useMemo(() => {
    const complete = data.filter((r) => r.phase === "complete");
    const active = data.filter((r) => ["preparatory", "initial", "follow_up"].includes(r.phase));
    const scored = data.filter((r) => r.score > 0);
    const avg = scored.length
      ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length)
      : 0;
    return [
      { label: "Total DFOWs", value: data.length },
      { label: "In progress", value: active.length, tone: "warning" as const },
      { label: "Complete", value: complete.length, tone: "success" as const },
      {
        label: "Avg score",
        value: avg > 0 ? `${avg}/100` : "—",
        tone: avg >= 85 ? ("success" as const) : avg > 0 ? ("caution" as const) : undefined,
        sub: `${scored.length} scored`,
      },
    ];
  }, [data]);

  const columns: Column<Dfow>[] = [
    { key: "num", header: "DFOW #", cell: (r) => <span className="font-mono text-xs">{r.dfow_number}</span> },
    { key: "name", header: "Feature of work", cell: (r) => r.name },
    { key: "spec", header: "Spec", cell: (r) => <span className="font-mono text-xs">{r.spec_sections || "—"}</span> },
    {
      key: "phase",
      header: "Phase",
      cell: (r) => <StatusBadge tone={PHASE_TONE[r.phase] ?? "neutral"}>{humanizeStatus(r.phase)}</StatusBadge>,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      cell: (r) => {
        const { label, className } = formatQualityScore(r.score);
        return <span className={className}>{label}</span>;
      },
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
      title="Definable features of work"
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
      addLabel="Add DFOW"
      emptyIcon={Search}
      emptyTitle="No DFOWs yet"
      emptyDescription="Add a definable feature of work to run it through the three CQM-C phases."
      insights={
        data.length > 0 ? (
          <Card className="rounded-r12">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Phase progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {phaseProgress.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">
                      {row.count}/{row.total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-secondary">
                    <div
                      className={cn("h-full rounded", row.count === row.total ? "bg-success" : "bg-primary")}
                      style={{ width: `${row.total ? (row.count / row.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null
      }
    >
      <DfowDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} dfow={editTarget} />
    </CollectionView>
  );
}
