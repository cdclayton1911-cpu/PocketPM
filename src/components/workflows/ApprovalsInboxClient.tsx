"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { TemplateSnapshot } from "@/lib/workflow/rules";

interface InboxRow {
  instance: {
    id: string;
    project: string;
    submittal: string;
    rfi: string;
    status: string;
    current_step_order: number;
    template_snapshot: TemplateSnapshot;
    created: string;
  };
  approvers: string[];
}

/** Whole days since an ISO timestamp, floored. */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function ApprovalsInboxClient({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const query = useQuery<{ items: InboxRow[] }>({
    queryKey: ["workflow-inbox", currentUserId],
    queryFn: async () => {
      const res = await fetch("/api/workflow/inbox");
      if (!res.ok) throw new Error("Could not load your approvals");
      return res.json();
    },
  });

  const rows = query.data?.items ?? [];

  const columns: Column<InboxRow>[] = [
    {
      key: "type",
      header: "Type",
      cell: (row) => (row.instance.submittal ? "Submittal" : "RFI"),
    },
    {
      key: "step",
      header: "Waiting on",
      cell: (row) => {
        const step = (row.instance.template_snapshot.steps ?? []).find(
          (s) => s.step_order === row.instance.current_step_order,
        );
        return step?.name ?? `Step ${row.instance.current_step_order}`;
      },
    },
    {
      key: "template",
      header: "Workflow",
      cell: (row) => row.instance.template_snapshot.template?.name ?? "—",
    },
    {
      key: "waiting",
      header: "Days waiting",
      align: "right",
      cell: (row) => {
        const days = daysSince(row.instance.created);
        const step = (row.instance.template_snapshot.steps ?? []).find(
          (s) => s.step_order === row.instance.current_step_order,
        );
        // Only a step that actually sets an SLA can breach one. A step with no
        // sla_days is not overdue, however long it sits.
        const breached = step?.sla_days != null && days > step.sla_days;
        return (
          <span className={cn(breached && "font-medium text-red-700")}>
            {days}
            {breached ? ` · ${step.sla_days}d SLA` : null}
          </span>
        );
      },
    },
  ];

  return (
    <div className="p-4">
      <h1 className="mb-1 text-base font-semibold">My approvals</h1>
      <p className="mb-4 text-[12px] text-neutral-500">
        Everything across your projects that is waiting on you.
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.instance.id}
        loading={query.isLoading}
        onRowClick={(row) =>
          router.push(
            row.instance.submittal
              ? `/submittals/${row.instance.submittal}`
              : `/rfis/${row.instance.rfi}`,
          )
        }
        empty={
          <EmptyState
            title="Nothing waiting on you"
            description="Approvals appear here when a workflow reaches a step you are named on."
          />
        }
      />
    </div>
  );
}
