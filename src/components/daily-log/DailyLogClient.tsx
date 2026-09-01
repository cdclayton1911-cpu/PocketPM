"use client";

import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionView } from "@/components/shared/CollectionView";
import type { Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { createCollectionHooks } from "@/hooks/createCollectionHooks";
import { daysUntil } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { DailyLog } from "@/types";

import { DailyLogDialog } from "./DailyLogDialog";

export const dailyLogHooks = createCollectionHooks({
  collection: "daily_logs",
  path: "daily-logs",
  label: "daily log",
  titleField: "log_date",
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "recent", label: "Last 14 days" },
  { value: "unsigned", label: "Unsigned" },
  { value: "issues", label: "With issues" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Days since the log's date; null when unparseable. */
function ageInDays(log: DailyLog): number | null {
  const days = daysUntil(log.log_date);
  return days === null ? null : -days;
}

function isSigned(log: DailyLog): boolean {
  return Boolean(log.signed_by?.trim());
}

/** First line only — the table shows a summary, the dialog shows the full text. */
function firstLine(text: string, max = 90): string {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export function DailyLogClient({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: DailyLog[];
}) {
  const query = dailyLogHooks.useList(projectId, initialData);
  const data = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DailyLog | null>(null);

  const rows = useMemo(() => {
    if (filter === "unsigned") return data.filter((log) => !isSigned(log));
    if (filter === "issues") return data.filter((log) => log.issues?.trim());
    if (filter === "recent") {
      return data.filter((log) => {
        const age = ageInDays(log);
        return age !== null && age >= 0 && age <= 14;
      });
    }
    return data;
  }, [data, filter]);

  const stats = useMemo(() => {
    const unsigned = data.filter((log) => !isSigned(log));
    const withIssues = data.filter((log) => log.issues?.trim());
    const staffed = data.filter((log) => log.total_workers > 0);
    const averageWorkers = staffed.length
      ? Math.round(staffed.reduce((sum, log) => sum + log.total_workers, 0) / staffed.length)
      : 0;

    // Sorted by log_date server-side, so the newest is first.
    const latest = data[0]?.log_date ?? "";
    const gap = latest ? ageInDays(data[0]) : null;

    return [
      { label: "Logs recorded", value: data.length },
      {
        label: "Most recent",
        value: latest || "—",
        // A log that is days old is the thing a PM wants flagged: the record is
        // only a contemporaneous record if it is kept contemporaneously.
        sub: gap === null ? undefined : gap <= 1 ? "Up to date" : `${gap} days ago`,
        tone: gap !== null && gap > 3 ? ("warning" as const) : undefined,
      },
      {
        label: "Unsigned",
        value: unsigned.length,
        tone: unsigned.length ? ("caution" as const) : undefined,
        sub: unsigned.length ? "Awaiting signature" : "All signed",
      },
      {
        label: "Avg. workers",
        value: averageWorkers || "—",
        sub: withIssues.length ? `${withIssues.length} days with issues` : "No issues logged",
      },
    ];
  }, [data]);

  const columns: Column<DailyLog>[] = [
    {
      key: "date",
      header: "Date",
      cell: (log) => <span className="font-mono text-xs">{log.log_date || "—"}</span>,
    },
    {
      key: "weather",
      header: "Weather",
      cell: (log) => {
        const temps =
          log.temp_high || log.temp_low
            ? `${log.temp_high || "—"}° / ${log.temp_low || "—"}°`
            : "";
        return (
          <span>
            {log.weather || "—"}
            {temps ? <span className="ml-1 text-muted-foreground">{temps}</span> : null}
          </span>
        );
      },
    },
    {
      key: "workers",
      header: "Workers",
      align: "right",
      cell: (log) => (log.total_workers ? log.total_workers : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "work",
      header: "Work performed",
      cell: (log) =>
        log.work_performed ? (
          firstLine(log.work_performed)
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        ),
    },
    {
      key: "issues",
      header: "Issues",
      cell: (log) =>
        log.issues?.trim() ? (
          <span className="text-danger">{firstLine(log.issues, 50)}</span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      key: "signed",
      header: "Signed",
      cell: (log) =>
        isSigned(log) ? (
          <StatusBadge tone="success">{log.signed_by}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Unsigned</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (log) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            setEditTarget(log);
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
      title="Daily logs"
      query={query}
      columns={columns}
      rows={rows}
      rowKey={(log) => log.id}
      stats={stats}
      filters={FILTERS}
      filter={filter}
      onFilterChange={setFilter}
      onAdd={() => {
        setEditTarget(null);
        setDialogOpen(true);
      }}
      addLabel="New log"
      emptyIcon={ClipboardList}
      emptyTitle="No daily logs yet"
      emptyDescription="A daily log is the project's contemporaneous record — the one document that carries weight in a delay or differing-site-conditions claim."
      rowClassName={(log) => cn(log.issues?.trim() && "bg-danger-subtle/30")}
    >
      <DailyLogDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        log={editTarget}
      />
    </CollectionView>
  );
}
