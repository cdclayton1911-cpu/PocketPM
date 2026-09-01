import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProgressRow } from "@/components/shared/ProgressRow";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntil, expiryUrgency } from "@/lib/registry-format";
import type { AiaNotice, ChangeOrder, PayApplication, Project, Subcontractor } from "@/types";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

interface Risk {
  tone: BadgeTone;
  level: string;
  title: string;
  detail: string;
  href: string;
  rank: number;
}

/**
 * AIA contract administration overview.
 *
 * Derived from notices, change orders, pay applications, and subcontracts.
 *
 * The prototype's version of this page was a hardcoded risk register — ten
 * static rows about a demo project, including specific dollar exposures. None
 * of that is reproduced here: every item below is computed from the project's
 * own records, and the page shows nothing when there is nothing to show.
 */
export function AiaDashboardView({
  project,
  data,
  failed,
}: {
  project: Project;
  data: {
    aia_notices: AiaNotice[];
    change_orders: ChangeOrder[];
    pay_applications: PayApplication[];
    subcontractors: Subcontractor[];
  };
  failed: string[];
}) {
  const { aia_notices: notices, change_orders: cos, pay_applications: payApps, subcontractors: subs } = data;

  const missedNotices = notices.filter((n) => {
    if (n.notice_sent_date || !["upcoming", "pending", "overdue"].includes(n.status)) return false;
    const d = daysUntil(n.notice_deadline);
    return d !== null && d < 0;
  });
  const imminentNotices = notices.filter((n) => {
    if (n.notice_sent_date) return false;
    const d = daysUntil(n.notice_deadline);
    return d !== null && d >= 0 && d <= 7;
  });

  const approved = cos.filter((c) => c.status === "approved");
  const coTotal = approved.reduce((s, c) => s + (c.amount || 0), 0);
  const growth = project.contract_value > 0 ? (coTotal / project.contract_value) * 100 : 0;

  const activeSubs = subs.filter((s) => s.status !== "inactive");
  const unexecuted = activeSubs.filter((s) => s.a401_status === "not_executed");
  const lapsedInsurance = activeSubs.filter((s) => expiryUrgency(s.insurance_expiry) === "expired");
  const executed = activeSubs.filter((s) => s.a401_status === "executed");

  const disputed = payApps.filter((p) => p.status === "disputed");
  const awaiting = payApps.filter((p) => p.status === "submitted" || p.status === "certified");

  const risks: Risk[] = [
    ...missedNotices.map((n) => ({
      tone: "danger" as const,
      level: "HIGH",
      title: "Notice deadline passed",
      detail: `${n.notice_type}${n.aia_article ? ` (${n.aia_article})` : ""} — claim may be forfeit`,
      href: "/aia/notices",
      rank: 0,
    })),
    ...unexecuted.map((s) => ({
      tone: "danger" as const,
      level: "HIGH",
      title: "Subcontract not executed",
      detail: `${s.company_name} — work should not proceed under A401`,
      href: "/aia/subcontracts",
      rank: 1,
    })),
    ...lapsedInsurance.map((s) => ({
      tone: "danger" as const,
      level: "HIGH",
      title: "Insurance lapsed",
      detail: `${s.company_name} — coverage expired ${s.insurance_expiry}`,
      href: "/registry",
      rank: 2,
    })),
    ...disputed.map((p) => ({
      tone: "danger" as const,
      level: "HIGH",
      title: "Pay application disputed",
      detail: `Application ${p.app_number}`,
      href: "/pay-application",
      rank: 3,
    })),
    ...imminentNotices.map((n) => ({
      tone: "warning" as const,
      level: "MEDIUM",
      title: "Notice due within 7 days",
      detail: `${n.notice_type} — due ${n.notice_deadline}`,
      href: "/aia/notices",
      rank: 4,
    })),
    ...(growth > 5
      ? [
          {
            tone: "warning" as const,
            level: "MEDIUM",
            title: "Contract growth above 5%",
            detail: `${money(coTotal)} in approved change orders (${growth.toFixed(1)}%)`,
            href: "/change-orders",
            rank: 5,
          },
        ]
      : []),
  ].sort((a, b) => a.rank - b.rank);

  const highRisks = risks.filter((r) => r.level === "HIGH");

  return (
    <div className="flex flex-col gap-3">
      {failed.length > 0 ? (
        <p className="rounded-r6 border-l-[3px] border-caution bg-caution-subtle px-3 py-2 text-[13px] text-caution">
          Could not load: {failed.join(", ")}. This assessment is incomplete.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Contract value"
          value={project.contract_value ? money(project.contract_value + coTotal) : "—"}
          sub={project.contract_type ? `${project.contract_type} stipulated sum` : undefined}
        />
        <StatCard
          label="High risk items"
          value={highRisks.length}
          tone={highRisks.length ? "danger" : "success"}
          sub={highRisks.length ? "Action required" : "None open"}
        />
        <StatCard
          label="Notices due 7d"
          value={imminentNotices.length}
          tone={imminentNotices.length ? "warning" : "default"}
          sub={missedNotices.length ? `${missedNotices.length} already missed` : "None missed"}
          subTone={missedNotices.length ? "danger" : "default"}
        />
        <StatCard
          label="Subcontracts"
          value={activeSubs.length}
          sub={`${executed.length} executed · ${unexecuted.length} not`}
          subTone={unexecuted.length ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Contract health</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProgressRow
              label="Notice compliance"
              value={notices.length ? `${notices.length - missedNotices.length}/${notices.length}` : "—"}
              percent={notices.length ? ((notices.length - missedNotices.length) / notices.length) * 100 : 0}
              tone={missedNotices.length ? "danger" : "success"}
            />
            <ProgressRow
              label="Subcontracts executed"
              value={activeSubs.length ? `${executed.length}/${activeSubs.length}` : "—"}
              percent={activeSubs.length ? (executed.length / activeSubs.length) * 100 : 0}
              tone={unexecuted.length ? "danger" : "success"}
            />
            <ProgressRow
              label="Change order growth"
              value={`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
              percent={Math.abs(growth) * 10}
              tone={growth > 5 ? "danger" : growth > 0 ? "caution" : "success"}
            />
            <ProgressRow
              label="Pay applications settled"
              value={payApps.length ? `${payApps.filter((p) => p.status === "paid").length}/${payApps.length}` : "—"}
              percent={payApps.length ? (payApps.filter((p) => p.status === "paid").length / payApps.length) * 100 : 0}
              tone={disputed.length ? "danger" : awaiting.length ? "caution" : "success"}
            />
          </CardContent>
        </Card>

        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Contract risk register</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {risks.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No contract risks detected from the current records. This register is computed
                from notices, subcontracts, change orders, and pay applications — it is only as
                complete as those are.
              </p>
            ) : (
              risks.slice(0, 8).map((r, i) => (
                <Link
                  key={`${r.title}-${i}`}
                  href={r.href}
                  className="group flex items-start gap-2 rounded-r6 px-1 py-1 text-[13px] hover:bg-secondary"
                >
                  <StatusBadge tone={r.tone}>{r.level}</StatusBadge>
                  <span className="flex-1">
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-muted-foreground">{r.detail}</span>
                  </span>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
                </Link>
              ))
            )}
            {risks.length > 8 ? (
              <p className="text-xs text-muted-foreground">+{risks.length - 8} more</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
