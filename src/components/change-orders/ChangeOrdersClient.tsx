"use client";

import { Paperclip, Repeat } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { cn } from "@/lib/utils";
import type { ChangeOrder, ChangeOrderStatus } from "@/types";

import { ChangeOrderDialog } from "./ChangeOrderDialog";

export const coHooks = createCollectionHooks({
  collection: "change_orders",
  path: "change-orders",
  label: "Change order",
  titleField: "co_number",
});

const STATUS_TONE: Record<ChangeOrderStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  under_review: "warning",
  approved: "success",
  rejected: "danger",
  void: "neutral",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const money = (n: number) => {
  const abs = Math.abs(n);
  const formatted =
    abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M` : `$${Math.round(abs).toLocaleString()}`;
  return n < 0 ? `-${formatted}` : formatted;
};

/** Not yet accepted or refused — money still in play. */
const isPending = (r: ChangeOrder) =>
  r.status === "draft" || r.status === "submitted" || r.status === "under_review";

export function ChangeOrdersClient({
  projectId,
  initialData,
  contractValue,
}: {
  projectId: string;
  initialData: ChangeOrder[];
  contractValue: number;
}) {
  const query = coHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChangeOrder | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "pending") return data.filter(isPending);
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    // Only approved change orders move the contract. Pending ones are exposure,
    // not value, so they are reported separately rather than blended in.
    const approved = data.filter((r) => r.status === "approved");
    const approvedTotal = approved.reduce((s, r) => s + (r.amount || 0), 0);
    const pending = data.filter(isPending);
    const pendingTotal = pending.reduce((s, r) => s + (r.amount || 0), 0);
    const revised = contractValue + approvedTotal;
    const growth = contractValue > 0 ? (approvedTotal / contractValue) * 100 : 0;
    return [
      { label: "Original contract", value: contractValue ? money(contractValue) : "—" },
      {
        label: "Approved COs",
        value: money(approvedTotal),
        sub: `${approved.length} approved`,
        tone: approvedTotal > 0 ? ("caution" as const) : undefined,
      },
      {
        label: "Pending",
        value: money(pendingTotal),
        sub: `${pending.length} in negotiation`,
        tone: pending.length ? ("warning" as const) : undefined,
      },
      {
        label: "Revised contract",
        value: contractValue ? money(revised) : "—",
        sub: contractValue ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% growth` : undefined,
        // 5% CO growth is the conventional watch threshold on a fixed-sum job.
        tone: growth > 5 ? ("danger" as const) : undefined,
      },
    ];
  }, [data, contractValue]);

  const columns: Column<ChangeOrder>[] = [
    { key: "num", header: "CO #", cell: (r) => <span className="font-mono text-xs">{r.co_number}</span> },
    { key: "desc", header: "Description", cell: (r) => r.description },
    { key: "type", header: "Type", cell: (r) => r.type || "—" },
    { key: "reason", header: "Reason", cell: (r) => humanizeStatus(r.reason || "") },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (r) =>
        r.amount ? (
          <span className={cn("font-semibold", r.amount < 0 ? "text-success" : "text-foreground")}>
            {money(r.amount)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "days",
      header: "Days",
      align: "right",
      cell: (r) => (r.days_impact ? `+${r.days_impact}` : "—"),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanizeStatus(r.status)}</StatusBadge>,
    },
    {
      key: "files",
      header: "Backup",
      cell: (r) =>
        r.attachments?.length ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Paperclip className="size-3" aria-hidden />
            {r.attachments.length}
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
      title="Change order log"
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
      addLabel="New CO"
      emptyIcon={Repeat}
      emptyTitle="No change orders yet"
      emptyDescription="Log a PCO when additional work is directed or discovered."
    >
      <ChangeOrderDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        changeOrder={editTarget}
      />
    </CollectionView>
  );
}
