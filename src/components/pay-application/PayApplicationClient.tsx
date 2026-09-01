"use client";

import { CreditCard } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import type { PayApplication, PayApplicationStatus } from "@/types";

import { PayApplicationDialog } from "./PayApplicationDialog";

export const payAppHooks = createCollectionHooks({
  collection: "pay_applications",
  path: "pay-applications",
  label: "Pay application",
});

const STATUS_TONE: Record<PayApplicationStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  certified: "teal",
  paid: "success",
  disputed: "danger",
};

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

/**
 * Net payable this period.
 *
 * Uses the stored value when present, otherwise derives it as
 * (this period + stored materials) - retainage. Derivation matters because a
 * draft is usually entered with the gross figures first, and showing a blank
 * net would hide the number the application actually turns on.
 */
function netThisPeriod(row: PayApplication): number {
  if (row.net_this_period) return row.net_this_period;
  const gross = (row.this_period || 0) + (row.stored_materials || 0);
  const retainage =
    row.retainage_amount || (row.retainage_pct ? (gross * row.retainage_pct) / 100 : 0);
  return Math.max(0, gross - retainage);
}

export function PayApplicationClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: PayApplication[];
}) {
  const query = payAppHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PayApplication | null>(null);

  const stats = useMemo(() => {
    // Sorted newest-first, so the head is the current application.
    const current = data[0];
    const paid = data.filter((r) => r.status === "paid");
    const paidTotal = paid.reduce((s, r) => s + netThisPeriod(r), 0);
    const retainageHeld = data.reduce((s, r) => s + (r.retainage_amount || 0), 0);
    const outstanding = data.filter((r) => r.status === "submitted" || r.status === "certified");
    return [
      {
        label: "Current application",
        value: current ? `No. ${current.app_number}` : "—",
        sub: current ? humanizeStatus(current.status) : undefined,
      },
      {
        label: "This period (net)",
        value: current ? money(netThisPeriod(current)) : "—",
      },
      {
        label: "Retainage held",
        value: money(retainageHeld),
        tone: retainageHeld > 0 ? ("caution" as const) : undefined,
      },
      {
        label: "Paid to date",
        value: money(paidTotal),
        tone: "success" as const,
        sub: outstanding.length ? `${outstanding.length} awaiting payment` : "Nothing outstanding",
      },
    ];
  }, [data]);

  const columns: Column<PayApplication>[] = [
    { key: "num", header: "App #", cell: (r) => <span className="font-mono text-xs">{r.app_number}</span> },
    {
      key: "period",
      header: "Period",
      cell: (r) => (r.period_start && r.period_end ? `${r.period_start} → ${r.period_end}` : "—"),
    },
    {
      key: "this",
      header: "This period",
      align: "right",
      cell: (r) => (r.this_period ? money(r.this_period) : "—"),
    },
    {
      key: "stored",
      header: "Stored matl.",
      align: "right",
      cell: (r) => (r.stored_materials ? money(r.stored_materials) : "—"),
    },
    {
      key: "retainage",
      header: "Retainage",
      align: "right",
      cell: (r) =>
        r.retainage_amount ? (
          <span className="text-caution">{money(r.retainage_amount)}</span>
        ) : r.retainage_pct ? (
          <span className="text-muted-foreground">{r.retainage_pct}%</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      cell: (r) => <span className="font-semibold">{money(netThisPeriod(r))}</span>,
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
      title="Pay applications (G702/G703)"
      query={query}
      columns={columns}
      rows={data}
      rowKey={(r) => r.id}
      stats={stats}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="New application"
      emptyIcon={CreditCard}
      emptyTitle="No pay applications yet"
      emptyDescription="Create an application to bill for a period."
    >
      <PayApplicationDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payApp={editTarget}
      />
    </CollectionView>
  );
}
