"use client";

import { DollarSign } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { cn } from "@/lib/utils";
import type { BudgetItem } from "@/types";

import { BudgetDialog } from "./BudgetDialog";

export const budgetHooks = createCollectionHooks({
  collection: "budget_items",
  path: "budget-items",
  label: "Budget line",
  titleField: "description",
});

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

/**
 * Variance is budget minus committed: positive means under budget.
 *
 * Uses `committed` rather than `actual` deliberately — money that is committed
 * is already spoken for even if it has not been paid, which is what a PM needs
 * to see before it becomes an overrun.
 */
function variance(row: BudgetItem): number {
  return (row.budget || 0) - (row.committed || 0);
}

export function BudgetClient({
  projectId,
  initialData,
  contractValue,
}: {
  projectId: string;
  initialData: BudgetItem[];
  contractValue: number;
}) {
  const query = budgetHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BudgetItem | null>(null);

  const totals = useMemo(() => {
    const budget = data.reduce((s, r) => s + (r.budget || 0), 0);
    const committed = data.reduce((s, r) => s + (r.committed || 0), 0);
    const actual = data.reduce((s, r) => s + (r.actual || 0), 0);
    const over = data.filter((r) => variance(r) < 0);
    return { budget, committed, actual, over };
  }, [data]);

  const stats = useMemo(
    () => [
      {
        label: "Contract value",
        value: contractValue ? money(contractValue) : "—",
        sub: contractValue ? undefined : "Set on the project",
      },
      { label: "Budgeted", value: money(totals.budget), sub: `${data.length} lines` },
      {
        label: "Committed",
        value: money(totals.committed),
        // Committed exceeding the budget is the number that matters most here.
        tone: totals.committed > totals.budget && totals.budget > 0 ? ("danger" as const) : undefined,
      },
      {
        label: "Over budget",
        value: totals.over.length,
        tone: totals.over.length ? ("danger" as const) : ("success" as const),
        sub: totals.over.length ? "Lines exceeding budget" : "All lines within budget",
      },
    ],
    [contractValue, totals, data.length],
  );

  const columns: Column<BudgetItem>[] = [
    { key: "div", header: "Div.", cell: (r) => <span className="font-mono text-xs">{r.csi_division}</span> },
    { key: "desc", header: "Description", cell: (r) => r.description },
    { key: "budget", header: "Budget", align: "right", cell: (r) => (r.budget ? money(r.budget) : "—") },
    { key: "committed", header: "Committed", align: "right", cell: (r) => (r.committed ? money(r.committed) : "—") },
    { key: "actual", header: "Actual", align: "right", cell: (r) => (r.actual ? money(r.actual) : "—") },
    {
      key: "pct",
      header: "% cmplt",
      align: "right",
      cell: (r) => (r.pct_complete ? `${r.pct_complete}%` : "—"),
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      cell: (r) => {
        if (!r.budget && !r.committed) return <span className="text-muted-foreground">—</span>;
        const v = variance(r);
        return (
          <span className={cn("font-semibold", v < 0 ? "text-danger" : "text-success")}>
            {v < 0 ? "-" : "+"}
            {money(Math.abs(v))}
          </span>
        );
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
      title="Budget by CSI division"
      query={query}
      columns={columns}
      rows={data}
      rowKey={(r) => r.id}
      stats={stats}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="Add line"
      emptyIcon={DollarSign}
      emptyTitle="No budget lines yet"
      emptyDescription="Add CSI divisions to track budget against committed and actual cost."
      rowClassName={(r) => cn(variance(r) < 0 && "bg-danger-subtle/30")}
    >
      <BudgetDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} item={editTarget} />
    </CollectionView>
  );
}
