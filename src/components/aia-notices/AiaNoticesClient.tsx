"use client";

import { Bell } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { AiaNotice, AiaNoticeStatus } from "@/types";

import { AiaNoticeDialog } from "./AiaNoticeDialog";

export const noticeHooks = createCollectionHooks({
  collection: "aia_notices",
  path: "aia-notices",
  label: "Notice",
  titleField: "notice_type",
});

const STATUS_TONE: Record<AiaNoticeStatus, BadgeTone> = {
  upcoming: "neutral",
  pending: "warning",
  sent: "success",
  overdue: "danger",
  waived: "neutral",
  resolved: "success",
};

const FILTERS = [
  { value: "open", label: "Needs action" },
  { value: "overdue", label: "Missed" },
  { value: "sent", label: "Sent" },
  { value: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Still requires action: not yet sent, waived, or resolved. */
const needsAction = (r: AiaNotice) =>
  r.status === "upcoming" || r.status === "pending" || r.status === "overdue";

/**
 * A notice deadline is a contractual bar, not a to-do date.
 *
 * Missing it can forfeit a claim entirely, so a passed deadline on an unsent
 * notice is treated as missed regardless of the stored status — the record may
 * simply not have been updated, and the UI should not be the last thing to
 * notice.
 */
function isMissed(r: AiaNotice): boolean {
  if (!needsAction(r) || r.notice_sent_date) return false;
  const days = daysUntil(r.notice_deadline);
  return days !== null && days < 0;
}

function daysLeft(r: AiaNotice): number | null {
  if (!r.notice_deadline) return null;
  return daysUntil(r.notice_deadline);
}

export function AiaNoticesClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: AiaNotice[];
}) {
  const query = noticeHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AiaNotice | null>(null);

  const rows = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "open") return data.filter(needsAction);
    if (filter === "overdue") return data.filter(isMissed);
    return data.filter((r) => r.status === filter);
  }, [data, filter]);

  const stats = useMemo(() => {
    const open = data.filter(needsAction);
    const missed = data.filter(isMissed);
    // Within 7 days and not yet sent — the window where action is still possible.
    const imminent = open.filter((r) => {
      const days = daysLeft(r);
      return days !== null && days >= 0 && days <= 7;
    });
    const sent = data.filter((r) => r.status === "sent" || r.status === "resolved");
    return [
      { label: "Open obligations", value: open.length },
      {
        label: "Due within 7d",
        value: imminent.length,
        tone: imminent.length ? ("warning" as const) : undefined,
      },
      {
        label: "Missed",
        value: missed.length,
        tone: missed.length ? ("danger" as const) : ("success" as const),
        sub: missed.length ? "Claim may be forfeit" : "None missed",
      },
      { label: "Sent", value: sent.length, tone: "success" as const },
    ];
  }, [data]);

  const columns: Column<AiaNotice>[] = [
    { key: "type", header: "Notice type", cell: (r) => r.notice_type },
    { key: "article", header: "AIA article", cell: (r) => <span className="font-mono text-xs">{r.aia_article || "—"}</span> },
    { key: "trigger", header: "Trigger event", cell: (r) => r.trigger_event || "—" },
    {
      key: "deadline",
      header: "Deadline",
      cell: (r) =>
        r.notice_deadline ? (
          <span className={cn(isMissed(r) && "font-bold text-danger")}>{r.notice_deadline}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "days",
      header: "Days left",
      align: "right",
      cell: (r) => {
        const days = daysLeft(r);
        if (days === null || !needsAction(r)) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn(days < 0 ? "font-bold text-danger" : days <= 7 && "font-semibold text-caution")}>
            {days < 0 ? days : `+${days}`}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        isMissed(r) ? (
          <StatusBadge tone="danger">Missed</StatusBadge>
        ) : (
          <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanizeStatus(r.status)}</StatusBadge>
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
      title="Notices & deadlines"
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
      addLabel="Log notice"
      emptyIcon={Bell}
      emptyTitle="No notice obligations tracked"
      emptyDescription="Log a contractual notice so its deadline is not missed."
      rowClassName={(r) => cn(isMissed(r) && "bg-danger-subtle/40")}
    >
      <AiaNoticeDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} notice={editTarget} />
    </CollectionView>
  );
}
