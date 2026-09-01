"use client";

import { Handshake } from "lucide-react";
import { useMemo, useState } from "react";

import { SubcontractorDialog } from "@/components/registry/SubcontractorDialog";
import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useSubcontractors } from "@/hooks/useSubcontractors";
import { EXPIRY_CLASS, expiryUrgency, formatBondCapacity } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Subcontractor, SubcontractorA401Status } from "@/types";

/**
 * A401 subcontract management.
 *
 * Reuses the registry's data hook and dialog rather than duplicating them:
 * this is the same records viewed through a contract lens. Editing here and in
 * the Registry writes to one record, so the two views cannot disagree — and
 * because they share a query key, a change in one refreshes the other.
 */

const A401_TONE: Record<SubcontractorA401Status, BadgeTone> = {
  executed: "success",
  pending: "warning",
  not_executed: "danger",
  terminated: "neutral",
};

const FILTERS = [
  { value: "active", label: "Active subs" },
  { value: "not_executed", label: "Not executed" },
  { value: "pending", label: "Pending" },
  { value: "executed", label: "Executed" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/**
 * Work should not proceed under an unexecuted subcontract, and insurance that
 * has lapsed is the other condition that stops work. Both are flagged.
 */
function isBlocking(r: Subcontractor): boolean {
  if (r.status === "inactive") return false;
  if (r.a401_status === "not_executed") return true;
  return expiryUrgency(r.insurance_expiry) === "expired";
}

export function SubcontractsClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: Subcontractor[];
}) {
  const query = useSubcontractors(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Subcontractor | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "active") return data.filter((r) => r.status !== "inactive");
    return data.filter((r) => r.a401_status === filter && r.status !== "inactive");
  }, [data, filter]);

  const stats = useMemo(() => {
    const active = data.filter((r) => r.status !== "inactive");
    const executed = active.filter((r) => r.a401_status === "executed");
    const blocking = active.filter(isBlocking);
    const totalBond = active.reduce((s, r) => s + (r.bond_capacity || 0), 0);
    return [
      { label: "Subcontracts", value: active.length },
      { label: "Executed", value: executed.length, tone: "success" as const },
      {
        label: "Work blocked",
        value: blocking.length,
        tone: blocking.length ? ("danger" as const) : ("success" as const),
        sub: blocking.length ? "Unexecuted or lapsed insurance" : "None blocking",
      },
      { label: "Bond capacity", value: formatBondCapacity(totalBond) },
    ];
  }, [data]);

  const columns: Column<Subcontractor>[] = [
    { key: "company", header: "Sub", cell: (r) => <span className="font-semibold">{r.company_name}</span> },
    { key: "trade", header: "Trade", cell: (r) => r.trade || "—" },
    {
      key: "insurance",
      header: "Insurance",
      cell: (r) => {
        const urgency = expiryUrgency(r.insurance_expiry);
        if (urgency === "none") return <StatusBadge tone="neutral">Not on file</StatusBadge>;
        if (urgency === "expired") return <StatusBadge tone="danger">Expired</StatusBadge>;
        return <span className={EXPIRY_CLASS[urgency]}>{r.insurance_expiry}</span>;
      },
    },
    {
      key: "bond",
      header: "Bond",
      align: "right",
      cell: (r) => formatBondCapacity(r.bond_capacity),
    },
    {
      key: "a401",
      header: "A401 status",
      cell: (r) => (
        <StatusBadge tone={A401_TONE[r.a401_status] ?? "neutral"}>
          {r.a401_status === "not_executed" ? "NOT EXECUTED" : humanizeStatus(r.a401_status)}
        </StatusBadge>
      ),
    },
    {
      key: "flowdown",
      header: "Flow-down",
      // A201 flow-down is presumed once the A401 is executed; there is no
      // separate field for it in the schema, so this reports the A401 rather
      // than inventing a second source of truth.
      cell: (r) =>
        r.a401_status === "executed" ? (
          <StatusBadge tone="success">A201 ✓</StatusBadge>
        ) : (
          <StatusBadge tone="danger">Missing</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant={r.a401_status === "not_executed" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => {
            setEditTarget(r);
            setDialogOpen(true);
          }}
        >
          {r.a401_status === "not_executed" ? "Execute" : "Review"}
        </Button>
      ),
    },
  ];

  return (
    <CollectionView
      title="Subcontract register (AIA A401)"
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
      addLabel="Add subcontractor"
      emptyIcon={Handshake}
      emptyTitle="No subcontracts yet"
      emptyDescription="Subcontracts are drawn from the subcontractor registry."
      rowClassName={(r) => cn(isBlocking(r) && "bg-danger-subtle/40")}
    >
      <SubcontractorDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subcontractor={editTarget}
      />
    </CollectionView>
  );
}
