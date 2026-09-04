"use client";

import { FileText, Layers } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView, type FilterSpec } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge } from "@/components/shared/StatusBadge";
import { RevisionsDialog } from "@/components/revisions/RevisionsDialog";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { EXPIRY_CLASS, expiryUrgency } from "@/lib/registry-format";
import type { Submittal, SubmittalDisposition } from "@/types";

import { SubmittalDialog } from "./SubmittalDialog";

export const submittalHooks = createCollectionHooks({
  collection: "submittals",
  label: "Submittal",
  titleField: "submittal_number",
});

/** Prototype's disposition colouring. */
const DISPOSITION_TONE: Record<SubmittalDisposition, "success" | "warning" | "info" | "danger" | "neutral"> = {
  pending: "neutral",
  pending_ae: "info",
  approved: "success",
  approved_as_noted: "success",
  revise_resubmit: "warning",
  rejected: "danger",
  void: "neutral",
  overdue: "danger",
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "pending_ae", label: "Pending A/E" },
  { value: "approved", label: "Approved" },
  { value: "revise_resubmit", label: "Revise & resubmit" },
  { value: "overdue", label: "Overdue" },
  { value: "all", label: "All" },
] as const satisfies readonly FilterSpec<string>[];

type Filter = (typeof FILTERS)[number]["value"];

export function SubmittalsClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: Submittal[];
}) {
  const query = submittalHooks.useList(projectId, initialData);
  // Memoised: `?? []` would allocate a new array every render, invalidating the
  // useMemo hooks below on each pass.
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revisionsFor, setRevisionsFor] = useState<{ id: string; label: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Submittal | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    // "Open" is anything still needing action — the prototype's default view.
    if (filter === "open") {
      return data.filter((row) => !["approved", "approved_as_noted", "void"].includes(row.disposition));
    }
    if (filter === "approved") {
      return data.filter((row) => row.disposition === "approved" || row.disposition === "approved_as_noted");
    }
    return data.filter((row) => row.disposition === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter((r) => !["approved", "approved_as_noted", "void"].includes(r.disposition));
    const overdue = data.filter(
      (r) => r.disposition === "overdue" || expiryUrgency(r.ae_due_date) === "expired",
    );
    const pendingAe = data.filter((r) => r.disposition === "pending_ae");
    const approved = data.filter((r) => ["approved", "approved_as_noted"].includes(r.disposition));
    return [
      { label: "Total", value: data.length },
      { label: "Open", value: open.length, tone: "warning" as const },
      { label: "Overdue", value: overdue.length, tone: overdue.length ? ("danger" as const) : undefined },
      { label: "Approved", value: approved.length, tone: "success" as const, sub: `${pendingAe.length} pending A/E` },
    ];
  }, [data]);

  const columns: Column<Submittal>[] = [
    { key: "num", header: "#", cell: (r) => <span className="font-mono text-xs">{r.submittal_number}</span> },
    { key: "desc", header: "Description", cell: (r) => r.description },
    { key: "spec", header: "Spec", cell: (r) => <span className="font-mono text-xs">{r.spec_section || "—"}</span> },
    { key: "submitted", header: "Submitted", cell: (r) => r.submitted_date || "—" },
    {
      key: "due",
      header: "A/E due",
      cell: (r) => {
        const urgency = expiryUrgency(r.ae_due_date);
        if (urgency === "none") return <span className="text-muted-foreground">—</span>;
        return (
          <span className={EXPIRY_CLASS[urgency]}>
            {r.ae_due_date}
            {urgency === "expired" ? " !" : ""}
          </span>
        );
      },
    },
    {
      key: "disposition",
      header: "Disposition",
      cell: (r) => (
        <StatusBadge tone={DISPOSITION_TONE[r.disposition] ?? "neutral"}>
          {humanizeStatus(r.disposition)}
        </StatusBadge>
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
          onClick={() => setRevisionsFor({ id: r.id, label: r.submittal_number })}
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
      title="Submittal register"
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
      addLabel="New submittal"
      emptyIcon={FileText}
      emptyTitle="No submittals yet"
      emptyDescription="Log a submittal to start tracking A/E review."
    >
      <SubmittalDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        submittal={editTarget}
      />
      {revisionsFor ? (
        <RevisionsDialog
          parentType="submittal"
          parentId={revisionsFor.id}
          parentLabel={revisionsFor.label}
          open
          onOpenChange={(open) => !open && setRevisionsFor(null)}
        />
      ) : null}
    </CollectionView>
  );
}
