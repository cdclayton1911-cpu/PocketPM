"use client";

import { Info, RefreshCw, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CalendarSource } from "@/lib/schedule/analyze";
import type { CpmResult } from "@/lib/schedule/cpm";
import type { DivergenceReport, DivergenceRow } from "@/lib/schedule/divergence";
import { constraintLabel, DIVERGENCE_CAUSE_LABEL } from "@/lib/schedule/labels";
import { formatDays } from "@/lib/schedule/units";

interface Row extends CpmResult {
  activity_id: string;
  activity: string;
  imported_start: string | null;
  imported_finish: string | null;
}

function calendarPhrase(source: CalendarSource): string {
  if (source.kind === "project") return "the project working calendar";
  return source.name
    ? `the “${source.name}” calendar from the latest schedule import`
    : "the calendar from the latest schedule import";
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "sky" }) {
  return (
    <span className={cn("ml-1 text-[10px]", tone === "sky" ? "text-sky-700" : "text-neutral-500")}>{children}</span>
  );
}

export function ScheduleAnalysisClient({
  rows,
  divergence,
  projectFinish,
  error,
  freshness,
  computedAt,
  calendarSource,
  dataDate,
}: {
  rows: Row[];
  divergence: DivergenceReport | null;
  projectFinish: string | null;
  error: string | null;
  /** Whether the SAVED results still match the inputs. */
  freshness: "fresh" | "stale" | "never-computed";
  computedAt: string | null;
  /** Which calendar the dates were computed on. Always shown. */
  calendarSource: CalendarSource;
  /** The latest import's data date; null when there is none. */
  dataDate: string | null;
}) {
  const [tab, setTab] = useState<"cpm" | "divergence">("cpm");
  const [saving, setSaving] = useState(false);

  async function recalculate() {
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/analysis", { method: "POST" });
      if (!res.ok) throw new Error("Could not save the calculation");
      toast.success("Saved results updated.");
      window.location.reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="p-4">
          <h1 className="text-base font-semibold">Schedule analysis</h1>
          <p className="mt-2 text-[13px] text-red-700">
            {error === "cycle"
              ? "The schedule contains a circular dependency, so no dates can be calculated. Find and remove the loop in the relationships."
              : error === "no_working_days"
                ? "The working calendar has no working days, so no dates can be calculated."
                : "There are no schedule activities yet."}
          </p>
        </Card>
      </div>
    );
  }

  const cpmColumns: Column<Row>[] = [
    { key: "id", header: "Activity", cell: (r) => r.activity_id },
    { key: "name", header: "Description", cell: (r) => r.activity },
    {
      key: "imported",
      header: "Target",
      // Shown alongside, never replaced: the mirrored dates are the only thing
      // the computation can be checked against.
      cell: (r) => (
        <span className="text-neutral-500 tabular-nums">
          {r.imported_start ?? "—"} → {r.imported_finish ?? "—"}
        </span>
      ),
    },
    {
      key: "computed",
      header: "Computed (early)",
      cell: (r) =>
        r.excluded ? (
          <span className="text-[11px] text-neutral-500">
            Level of effort: spans other work, not scheduled by logic
          </span>
        ) : (
          <span className="tabular-nums">
            {r.early_start ?? "—"} → {r.early_finish ?? "—"}
            {r.pinned_start || r.pinned_finish ? <Tag tone="sky">actual</Tag> : null}
            {r.floored_by_data_date ? <Tag>data date</Tag> : null}
            {r.as_late_as_possible ? <Tag>as late as possible</Tag> : null}
          </span>
        ),
    },
    { key: "float", header: "Total float", align: "right", cell: (r) => formatDays(r.total_float) },
    {
      key: "critical",
      header: "Critical",
      cell: (r) =>
        r.is_critical ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
            critical
          </span>
        ) : null,
    },
  ];

  const divColumns: Column<DivergenceRow>[] = [
    { key: "id", header: "Activity", cell: (r) => r.activity_id },
    { key: "name", header: "Description", cell: (r) => r.activity },
    {
      key: "imported",
      header: "Source early start",
      cell: (r) => <span className="tabular-nums text-neutral-500">{r.imported_start ?? "—"}</span>,
    },
    {
      key: "computed",
      header: "Computed start",
      cell: (r) => <span className="tabular-nums">{r.computed_start ?? "—"}</span>,
    },
    {
      key: "delta",
      header: "Difference",
      align: "right",
      cell: (r) => (
        <span
          className={cn(
            "tabular-nums",
            r.magnitude === "severe" && "font-medium text-red-700",
            r.magnitude === "notable" && "text-amber-700",
          )}
        >
          {r.start_delta ? formatDays(r.start_delta) : "—"}
        </span>
      ),
    },
    {
      key: "why",
      header: "Why",
      cell: (r) => {
        if (!r.cause) return null;
        const cause = DIVERGENCE_CAUSE_LABEL[r.cause];
        const constraint = r.cause === "constraint_not_applied" ? constraintLabel(r.constraint_type) : null;
        return (
          <span
            title={cause.hint}
            className={cn("text-[11px]", r.cause === "unexplained" ? "font-medium text-red-700" : "text-neutral-600")}
          >
            {cause.label}
            {constraint ? `: ${constraint}` : null}
            {r.cause === "unexplained" && r.likely_constrained ? (
              <span className="block font-normal text-amber-800">
                Source date is later: possibly a constraint the file didn&rsquo;t include
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  const excludedCount = divergence?.excluded.length ?? 0;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold">Schedule analysis</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          Calculated from the activity logic and {calendarPhrase(calendarSource)}.
          {dataDate ? ` Data date ${dataDate}: no remaining work is scheduled before it.` : null}
          {projectFinish ? ` Project finish: ${projectFinish}.` : null}
        </p>
      </div>

      {calendarSource.kind === "import" && calendarSource.warnings.length > 0 ? (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-0.5">
            {calendarSource.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        Visible, not a tooltip. The figures ON THIS PAGE are always computed
        fresh — what can be stale is the copy saved on each activity, which
        other views may read. Saying which is which matters more than saying
        "stale".
      */}
      {freshness !== "fresh" ? (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              {freshness === "never-computed"
                ? "These results have never been saved to the activities."
                : "The saved results on each activity are out of date."}
            </p>
            <p className="mt-0.5">
              The dates and float shown here are calculated now and are correct. The copy stored on
              each activity{" "}
              {freshness === "never-computed"
                ? "does not exist yet"
                : `was calculated${computedAt ? ` on ${computedAt.slice(0, 10)}` : ""} from a different schedule or calendar`}
              , so any other view reading those saved values would be wrong.
            </p>
            <Button className="mt-2" variant="outline" onClick={recalculate} disabled={saving}>
              <RefreshCw className={cn("mr-1 size-3", saving && "animate-spin")} />
              {saving ? "Saving…" : "Save these results to the activities"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-neutral-200">
        {(["cpm", "divergence"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-[13px]",
              tab === t ? "border-neutral-800 font-medium" : "border-transparent text-neutral-500",
            )}
          >
            {t === "cpm"
              ? "Critical path"
              : `Divergence${divergence ? ` (${divergence.unexplained.length} unexplained)` : ""}`}
          </button>
        ))}
      </div>

      {tab === "cpm" ? (
        <DataTable
          columns={cpmColumns}
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.is_critical ? "bg-red-50/40" : undefined)}
          empty={<EmptyState title="No activities" description="Import a schedule to see the critical path." />}
        />
      ) : (
        <div className="space-y-3">
          {/*
            Without this, the first PM to open the report concludes the CPM is
            broken. Most differences have a known cause, and saying which is the
            difference between a useful diagnostic and a bug report.
          */}
          <div className="flex gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">A difference here usually is not an error.</p>
              <p className="mt-0.5">
                These dates come from activity logic, the calendar, actual progress and the data
                date. P6 constraints other than as-late-as-possible aren&rsquo;t applied yet, so where
                P6 holds a date with one, the row says which constraint.
              </p>
              <p className="mt-1">
                Rows marked <strong>unexplained</strong> are the ones worth checking: usually a
                missing or wrong relationship, or a calendar difference.
              </p>
            </div>
          </div>

          {divergence && divergence.missingSourceDates > 0 ? (
            <p className="rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700">
              {divergence.missingSourceDates} activit{divergence.missingSourceDates === 1 ? "y has" : "ies have"} no
              early dates from the source schedule, so there is nothing to compare them against. No
              difference shown for {divergence.missingSourceDates === 1 ? "it" : "them"} means not compared, not agreed.
            </p>
          ) : null}

          {excludedCount > 0 ? (
            <p className="rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700">
              {excludedCount} level-of-effort activit{excludedCount === 1 ? "y spans" : "ies span"} other work
              and {excludedCount === 1 ? "isn’t" : "aren’t"} scheduled by logic, so{" "}
              {excludedCount === 1 ? "it’s" : "they’re"} left out of this comparison.
            </p>
          ) : null}

          {divergence && divergence.unmatched.length > 0 ? (
            <p className="flex gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {divergence.unmatched.length} activity(ies) could not be matched to a calculated
              result and are not shown: {divergence.unmatched.slice(0, 5).join(", ")}
              {divergence.unmatched.length > 5 ? "…" : ""}
            </p>
          ) : null}

          <DataTable
            columns={divColumns}
            rows={(divergence?.rows ?? []).filter((r) => r.magnitude !== "none")}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                title="No differences"
                description="Every calculated date matches the imported schedule."
              />
            }
          />
        </div>
      )}
    </div>
  );
}
