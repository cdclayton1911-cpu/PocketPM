"use client";

import { Building2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { RegistryInsights } from "@/components/registry/RegistryInsights";
import { buildRegistryColumns } from "@/components/registry/registryColumns";
import { SubcontractorDialog } from "@/components/registry/SubcontractorDialog";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeactivateSubcontractor, useSubcontractors } from "@/hooks/useSubcontractors";
import { computeStats } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Subcontractor } from "@/types";

const FILTERS = [
  { value: "active", label: "All active" },
  { value: "qualified", label: "Qualified" },
  { value: "renewal_due", label: "Renewal due" },
  { value: "pending_docs", label: "Pending docs" },
  { value: "disqualified", label: "Disqualified" },
  // Soft-deleted rows stay reachable — removal is reversible.
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "Everything" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

export function RegistryClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: Subcontractor[];
}) {
  const { data = [], isLoading, isError, error, refetch } = useSubcontractors(projectId, initialData);
  const { deactivate } = useDeactivateSubcontractor(projectId);

  const [filter, setFilter] = useState<FilterValue>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Subcontractor | null>(null);

  const stats = useMemo(() => computeStats(data), [data]);
  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "active") return data.filter((row) => row.status !== "inactive");
    return data.filter((row) => row.status === filter);
  }, [data, filter]);

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  const columns = buildRegistryColumns({
    onEdit: (row) => {
      setEditTarget(row);
      setDialogOpen(true);
    },
    onDeactivate: deactivate,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total subs" value={stats.total} />
        <StatCard label="Qualified" value={stats.qualified} tone="success" />
        <StatCard
          label="Expiring 30d"
          value={stats.expiring30}
          tone={stats.expiring30 > 0 ? "caution" : "default"}
        />
        <StatCard
          label="Pending docs"
          value={stats.pendingDocs}
          tone={stats.pendingDocs > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="rounded-r12">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold">Subcontractor registry</CardTitle>
          <div className="flex items-center gap-2">
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as FilterValue)}
                className="h-8 rounded-r6 border border-input bg-card px-2 text-xs"
              >
                {FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
              <Plus className="size-3.5" aria-hidden /> Add subcontractor
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            // Explicit failure, never a silently empty table.
            <div className="p-4">
              <p className="mb-3 rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
                {error instanceof Error ? error.message : "Could not load the registry."}
              </p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={isLoading}
              rowClassName={(row) => cn(row.status === "inactive" && "opacity-55")}
              empty={
                data.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="No subcontractors yet"
                    description="Add your first subcontractor to start the registry."
                    action={
                      <Button size="sm" onClick={openCreate}>
                        <Plus className="size-3.5" aria-hidden /> Add subcontractor
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={Building2}
                    title="No matches"
                    description="No subcontractors have that status. Try a different filter."
                  />
                )
              }
            />
          )}
        </CardContent>
      </Card>

      <RegistryInsights rows={data} />

      <SubcontractorDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subcontractor={editTarget}
      />
    </div>
  );
}
