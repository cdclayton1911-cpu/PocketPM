import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProgressRow } from "@/components/shared/ProgressRow";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntil } from "@/lib/registry-format";
import type { Deficiency, Dfow, Subcontractor } from "@/types";

/**
 * PDCA quality dashboard.
 *
 * Plan / Do / Check / Act, each derived from the DFOW and deficiency
 * collections. No stored analytics — the panels are a read of the modules, so
 * they cannot drift from them.
 */
export function PdcaView({
  data,
  failed,
}: {
  data: { dfow: Dfow[]; deficiencies: Deficiency[]; subcontractors: Subcontractor[] };
  failed: string[];
}) {
  const { dfow, deficiencies } = data;

  const openDefs = deficiencies.filter((d) => ["open", "in_progress", "escalated"].includes(d.status));
  const closedDefs = deficiencies.filter((d) => d.status === "closed");
  const lifeSafety = openDefs.filter((d) => d.severity === "life_safety");
  const overdue = openDefs.filter((d) => {
    const days = daysUntil(d.due_date);
    return days !== null && days < 0;
  });

  // PLAN — what is coming next and what went wrong last time in that trade.
  const upcoming = dfow.filter((d) => d.phase === "not_started" || d.phase === "preparatory");

  // DO — the features actually in progress right now.
  const active = dfow.filter((d) => ["preparatory", "initial", "follow_up"].includes(d.phase));

  /**
   * CHECK — deficiencies per trade, and how many closed.
   *
   * Grouped by the free-text `trade` field. Rate is closed over total for that
   * trade; a trade with no deficiencies is absent rather than shown at 100%,
   * since "no data" and "perfect" are different claims.
   */
  const byTrade = Object.values(
    deficiencies.reduce<Record<string, { trade: string; total: number; closed: number }>>((acc, d) => {
      const trade = d.trade?.trim() || "Unassigned";
      acc[trade] ??= { trade, total: 0, closed: 0 };
      acc[trade].total += 1;
      if (d.status === "closed") acc[trade].closed += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  /**
   * ACT — repeat findings.
   *
   * Groups by the first four words of the description as a rough signature.
   * Crude, and labelled as such on screen: without a category field on the
   * collection there is nothing better to group by, and inventing a taxonomy
   * here would present a guess as analysis.
   */
  const repeats = Object.values(
    deficiencies.reduce<Record<string, { key: string; count: number; sample: string }>>((acc, d) => {
      const key = d.description.toLowerCase().split(/\s+/).slice(0, 4).join(" ");
      acc[key] ??= { key, count: 0, sample: d.description };
      acc[key].count += 1;
      return acc;
    }, {}),
  )
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count);

  const closureRate = deficiencies.length
    ? Math.round((closedDefs.length / deficiencies.length) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      {failed.length > 0 ? (
        <p className="rounded-r6 border-l-[3px] border-caution bg-caution-subtle px-3 py-2 text-[13px] text-caution">
          Could not load: {failed.join(", ")}. These figures are incomplete.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active DFOWs" value={active.length} sub={`${dfow.length} total`} />
        <StatCard
          label="Open deficiencies"
          value={openDefs.length}
          tone={openDefs.length ? "warning" : "success"}
          sub={overdue.length ? `${overdue.length} overdue` : "None overdue"}
          subTone={overdue.length ? "danger" : "default"}
        />
        <StatCard
          label="Life safety"
          value={lifeSafety.length}
          tone={lifeSafety.length ? "danger" : "success"}
          sub={lifeSafety.length ? "Stop work" : "None open"}
        />
        <StatCard
          label="Closure rate"
          value={deficiencies.length ? `${closureRate}%` : "—"}
          tone={closureRate >= 80 ? "success" : deficiencies.length ? "caution" : "default"}
          sub={`${closedDefs.length}/${deficiencies.length} closed`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-teal">Plan — coming up</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No DFOWs awaiting a preparatory meeting.
              </p>
            ) : (
              upcoming.slice(0, 6).map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono text-xs text-muted-foreground">{d.dfow_number}</span>
                  <span className="flex-1">{d.name}</span>
                  <StatusBadge tone={d.phase === "preparatory" ? "warning" : "neutral"}>
                    {d.phase === "preparatory" ? "Prep" : "Not started"}
                  </StatusBadge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-primary">Do — in progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {active.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No DFOWs in progress.</p>
            ) : (
              active.slice(0, 6).map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono text-xs text-muted-foreground">{d.dfow_number}</span>
                  <span className="flex-1">{d.name}</span>
                  <StatusBadge tone="info">{d.phase.replace(/_/g, " ")}</StatusBadge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-caution">Check — closure by trade</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {byTrade.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No deficiencies logged, so there is nothing to measure yet.
              </p>
            ) : (
              byTrade.slice(0, 6).map((t) => (
                <ProgressRow
                  key={t.trade}
                  label={t.trade}
                  value={`${t.closed}/${t.total} closed`}
                  percent={(t.closed / t.total) * 100}
                  tone={t.closed === t.total ? "success" : t.closed / t.total < 0.5 ? "danger" : "caution"}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-r12">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-success">Act — repeat findings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {repeats.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No repeated findings. Repeats are matched on the opening words of a description —
                a rough signal, not a classification.
              </p>
            ) : (
              <>
                {repeats.slice(0, 5).map((r) => (
                  <div key={r.key} className="flex items-start gap-2 text-[13px]">
                    <StatusBadge tone={r.count > 2 ? "danger" : "warning"}>{r.count}×</StatusBadge>
                    <span className="flex-1 text-muted-foreground">{r.sample}</span>
                  </div>
                ))}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Matched on the first few words of each description. The collection has no
                  category field, so this is indicative only.
                </p>
              </>
            )}
            <Link
              href="/deficiency"
              className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Open deficiency tracker <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
