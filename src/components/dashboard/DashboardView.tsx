import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { ProgressRow } from "@/components/shared/ProgressRow";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntil } from "@/lib/registry-format";
import type {
  AiaNotice,
  ChangeOrder,
  Deficiency,
  Project,
  Rfi,
  ScheduleItem,
  Subcontractor,
  Submittal,
} from "@/types";

interface DashboardData {
  rfis: Rfi[];
  submittals: Submittal[];
  deficiencies: Deficiency[];
  change_orders: ChangeOrder[];
  subcontractors: Subcontractor[];
  schedule_items: ScheduleItem[];
  aia_notices: AiaNotice[];
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

interface ActionItem {
  tone: BadgeTone;
  label: string;
  text: string;
  href: string;
  /** Lower sorts first. */
  rank: number;
}

/**
 * Everything on this page is derived from the module collections — nothing is
 * stored twice. A number here can therefore never disagree with the module it
 * summarises.
 */
export function DashboardView({
  project,
  data,
  failed,
}: {
  project: Project;
  data: DashboardData;
  failed: string[];
}) {
  const openRfis = data.rfis.filter((r) => r.status === "open" || r.status === "draft");
  const overdueRfis = openRfis.filter((r) => {
    const d = daysUntil(r.due_date);
    return d !== null && d < 0;
  });

  const openSubmittals = data.submittals.filter(
    (s) => !["approved", "approved_as_noted", "void"].includes(s.disposition),
  );

  const openDefs = data.deficiencies.filter((d) =>
    ["open", "in_progress", "escalated"].includes(d.status),
  );
  const lifeSafety = openDefs.filter((d) => d.severity === "life_safety");

  const approvedCos = data.change_orders.filter((c) => c.status === "approved");
  const coTotal = approvedCos.reduce((s, c) => s + (c.amount || 0), 0);
  const revised = project.contract_value + coTotal;
  const growth = project.contract_value > 0 ? (coTotal / project.contract_value) * 100 : 0;

  const slipping = data.schedule_items.filter((s) => {
    if (!s.planned_finish || !s.forecast_finish) return false;
    const p = daysUntil(s.planned_finish);
    const f = daysUntil(s.forecast_finish);
    return p !== null && f !== null && f > p;
  });

  const missedNotices = data.aia_notices.filter((n) => {
    if (n.notice_sent_date || !["upcoming", "pending", "overdue"].includes(n.status)) return false;
    const d = daysUntil(n.notice_deadline);
    return d !== null && d < 0;
  });

  const expiringInsurance = data.subcontractors.filter((s) => {
    if (s.status === "inactive") return false;
    const d = daysUntil(s.insurance_expiry);
    return d !== null && d >= 0 && d <= 30;
  });

  // Ordered by consequence, not by module: a life-safety deficiency outranks a
  // late submittal regardless of which list it came from.
  const actions: ActionItem[] = [
    ...lifeSafety.map((d) => ({
      tone: "danger" as const,
      label: "Life safety",
      text: d.description,
      href: "/deficiency",
      rank: 0,
    })),
    ...missedNotices.map((n) => ({
      tone: "danger" as const,
      label: "Notice missed",
      text: `${n.notice_type} — deadline passed`,
      href: "/aia/notices",
      rank: 1,
    })),
    ...overdueRfis.map((r) => ({
      tone: "danger" as const,
      label: "Overdue",
      text: `${r.rfi_number} — ${r.subject}`,
      href: "/rfis",
      rank: 2,
    })),
    ...expiringInsurance.map((s) => ({
      tone: "warning" as const,
      label: "Insurance",
      text: `${s.company_name} — expires ${s.insurance_expiry}`,
      href: "/registry",
      rank: 3,
    })),
    ...slipping.map((s) => ({
      tone: "warning" as const,
      label: "Slipping",
      text: s.activity,
      href: "/schedule",
      rank: 4,
    })),
  ].sort((a, b) => a.rank - b.rank);

  const completeActivities = data.schedule_items.filter((s) => s.status === "complete").length;
  const closedDefs = data.deficiencies.length - openDefs.length;

  return (
    <div className="flex flex-col gap-3">
      {failed.length > 0 ? (
        // Naming what failed, so a zero is never mistaken for "none".
        <p className="rounded-r6 border-l-[3px] border-caution bg-caution-subtle px-3 py-2 text-[13px] text-caution">
          Could not load: {failed.join(", ")}. Those figures are incomplete.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Contract value"
          value={project.contract_value ? money(revised) : "—"}
          sub={coTotal !== 0 ? `${coTotal > 0 ? "+" : ""}${money(coTotal)} in COs` : "No approved COs"}
          subTone={growth > 5 ? "danger" : "default"}
        />
        <StatCard
          label="Open RFIs"
          value={openRfis.length}
          sub={overdueRfis.length ? `${overdueRfis.length} overdue` : "None overdue"}
          subTone={overdueRfis.length ? "danger" : "default"}
        />
        <StatCard
          label="Submittal queue"
          value={openSubmittals.length}
          sub={openSubmittals.length ? "Need action" : "All returned"}
        />
        <StatCard
          label="Open deficiencies"
          value={openDefs.length}
          tone={lifeSafety.length ? "danger" : "default"}
          sub={lifeSafety.length ? `${lifeSafety.length} life safety` : "None life safety"}
          subTone={lifeSafety.length ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Project health</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProgressRow
              label="Contract growth"
              value={`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
              percent={Math.abs(growth) * 10}
              tone={growth > 5 ? "danger" : growth > 0 ? "caution" : "success"}
            />
            <ProgressRow
              label="Schedule complete"
              value={`${completeActivities}/${data.schedule_items.length}`}
              percent={data.schedule_items.length ? (completeActivities / data.schedule_items.length) * 100 : 0}
              tone={slipping.length ? "caution" : "success"}
            />
            <ProgressRow
              label="Submittals returned"
              value={`${data.submittals.length - openSubmittals.length}/${data.submittals.length}`}
              percent={data.submittals.length ? ((data.submittals.length - openSubmittals.length) / data.submittals.length) * 100 : 0}
            />
            <ProgressRow
              label="Deficiencies closed"
              value={`${closedDefs}/${data.deficiencies.length}`}
              percent={data.deficiencies.length ? (closedDefs / data.deficiencies.length) * 100 : 0}
              tone={lifeSafety.length ? "danger" : "success"}
            />
          </CardContent>
        </Card>

        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {actions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing overdue, missed, or flagged. {data.rfis.length + data.submittals.length === 0
                  ? "Start by logging RFIs and submittals."
                  : "The project is current."}
              </p>
            ) : (
              actions.slice(0, 8).map((a, i) => (
                <Link
                  key={`${a.label}-${i}`}
                  href={a.href}
                  className="group flex items-start gap-2 rounded-r6 px-1 py-1 text-[13px] hover:bg-secondary"
                >
                  <StatusBadge tone={a.tone}>{a.label}</StatusBadge>
                  <span className="flex-1 text-muted-foreground">{a.text}</span>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
                </Link>
              ))
            )}
            {actions.length > 8 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="size-3" aria-hidden />+{actions.length - 8} more
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
