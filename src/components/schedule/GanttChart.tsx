"use client";

import { Diamond, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectCalendar } from "@/lib/schedule/calendar";
import {
  ROW_HEIGHT,
  barGeometry,
  buildScale,
  dateToX,
  nonWorkingSpans,
  scheduleBounds,
} from "@/lib/schedule/gantt-geometry";

export interface GanttRow {
  id: string;
  activity_id: string;
  activity: string;
  planned_start: string;
  planned_finish: string;
  actual_start: string;
  actual_finish: string;
  pct_complete: number;
  is_milestone: boolean;
  is_critical: boolean;
  sort_order: number;
  early_start: string;
}

export interface GanttEdge {
  predecessor: string;
  successor: string;
  type: "FS" | "SS" | "FF" | "SF";
  lag_days: number;
}

const LABEL_WIDTH = 260;
const DEFAULT_LIMIT = 500;

export function GanttChart({
  rows,
  edges,
  calendar,
  projectStart,
  projectEnd,
  freshness,
}: {
  rows: GanttRow[];
  edges: GanttEdge[];
  calendar: ProjectCalendar;
  projectStart: string;
  projectEnd: string;
  /** Critical-path styling is drawn from saved columns; see bdd06c2. */
  freshness: "fresh" | "stale" | "never-computed";
}) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  const ordered = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          (a.early_start || a.planned_start || "").localeCompare(b.early_start || b.planned_start || ""),
      ),
    [rows],
  );

  const shown = ordered.slice(0, limit);
  const hidden = ordered.length - shown.length;

  const bounds = useMemo(
    () => scheduleBounds(ordered, projectStart, projectEnd),
    [ordered, projectStart, projectEnd],
  );
  const scale = useMemo(() => (bounds ? buildScale(bounds.from, bounds.to) : null), [bounds]);

  const indexById = useMemo(() => new Map(shown.map((r, i) => [r.id, i])), [shown]);

  // Only the selected activity's immediate edges, plus the critical chain.
  // Drawing every edge at once is unreadable at any density worth a Gantt, so
  // the expensive version produces the worse result.
  const visibleEdges = useMemo(() => {
    const criticalIds = new Set(shown.filter((r) => r.is_critical).map((r) => r.id));
    const onCritical =
      freshness === "fresh"
        ? edges.filter((e) => criticalIds.has(e.predecessor) && criticalIds.has(e.successor))
        : [];
    const selectedEdges = selected
      ? edges.filter((e) => e.predecessor === selected || e.successor === selected)
      : [];
    const seen = new Set<string>();
    return [...onCritical, ...selectedEdges].filter((e) => {
      const key = `${e.predecessor}-${e.successor}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return indexById.has(e.predecessor) && indexById.has(e.successor);
    });
  }, [edges, selected, shown, indexById, freshness]);

  if (ordered.length === 0) {
    return (
      <EmptyState
        title="No schedule yet"
        description="Import a schedule from CSV to see the bar chart, the critical path, and how the calculated dates compare with the imported ones."
        action={
          <Button asChild variant="outline">
            <Link href="/schedule/import">Import a schedule</Link>
          </Button>
        }
      />
    );
  }

  const tableColumns: Column<GanttRow>[] = [
    { key: "id", header: "Activity", cell: (r) => r.activity_id },
    { key: "name", header: "Description", cell: (r) => r.activity },
    { key: "start", header: "Start", cell: (r) => r.planned_start || "—" },
    { key: "finish", header: "Finish", cell: (r) => r.planned_finish || "—" },
    { key: "pct", header: "Complete", align: "right", cell: (r) => (r.pct_complete ? `${r.pct_complete}%` : "—") },
    {
      key: "critical",
      header: "Critical",
      cell: (r) => (freshness === "fresh" && r.is_critical ? "Yes" : ""),
    },
  ];

  return (
    <div className="space-y-3">
      {freshness !== "fresh" ? (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Critical path is not shown.</p>
            <p className="mt-0.5">
              The saved calculation on each activity{" "}
              {freshness === "never-computed" ? "has never been run" : "is out of date"}, and drawing
              a critical path from it would be wrong without looking wrong. Bars below show the
              imported dates, which are current.
            </p>
            <Button asChild className="mt-2" variant="outline">
              <Link href="/schedule/analysis">
                <RefreshCw className="mr-1 size-3" /> Open the analysis and save it
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded border px-2 py-1 text-[12px]",
                view === v ? "border-neutral-800 font-medium" : "border-neutral-300 text-neutral-500",
              )}
            >
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-500">
          {/* An SVG is unreadable to a screen reader. The table is the same
              data, one click away, not a separate page nobody finds. */}
          The table view carries the same data and works with a screen reader.
        </p>
      </div>

      {hidden > 0 ? (
        <p className="flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
          Showing {shown.length} of {ordered.length} activities.{" "}
          <strong>{hidden} are not drawn.</strong>
          <Button variant="outline" onClick={() => setLimit(limit + 500)}>
            Show 500 more
          </Button>
          <Button variant="ghost" onClick={() => setLimit(ordered.length)}>
            Show all {ordered.length}
          </Button>
        </p>
      ) : null}

      {view === "table" ? (
        <DataTable columns={tableColumns} rows={shown} rowKey={(r) => r.id} />
      ) : !scale ? (
        <p className="text-[13px] text-neutral-600">
          These activities have no readable dates, so there is nothing to place on a timeline. The
          table view lists them.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200">
          <svg
            width={LABEL_WIDTH + scale.width}
            height={40 + shown.length * ROW_HEIGHT}
            role="img"
            aria-label={`Gantt chart of ${shown.length} activities from ${scale.start} to ${scale.end}. The table view lists the same data.`}
            className="block"
          >
            <rect x={0} y={0} width={LABEL_WIDTH + scale.width} height={40 + shown.length * ROW_HEIGHT} fill="white" />

            {nonWorkingSpans(scale, calendar).map((span, i) => (
              <rect
                key={`off-${i}`}
                x={LABEL_WIDTH + span.x}
                y={40}
                width={span.width}
                height={shown.length * ROW_HEIGHT}
                fill="#f4f4f5"
              />
            ))}

            {scale.weeks.map((week) => (
              <g key={week.start}>
                <line
                  x1={LABEL_WIDTH + week.x}
                  y1={20}
                  x2={LABEL_WIDTH + week.x}
                  y2={40 + shown.length * ROW_HEIGHT}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                />
                {week.monthLabel ? (
                  <text x={LABEL_WIDTH + week.x + 2} y={14} fontSize={10} fill="#71717a">
                    {week.monthLabel}
                  </text>
                ) : null}
              </g>
            ))}

            {(() => {
              const today = new Date().toISOString().slice(0, 10);
              const x = dateToX(scale, today);
              if (x === null || x < 0 || x > scale.width) return null;
              return (
                <line
                  x1={LABEL_WIDTH + x}
                  y1={20}
                  x2={LABEL_WIDTH + x}
                  y2={40 + shown.length * ROW_HEIGHT}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                />
              );
            })()}

            {shown.map((row, index) => {
              const y = 40 + index * ROW_HEIGHT;
              const bar = barGeometry(scale, row);
              const critical = freshness === "fresh" && row.is_critical;
              const isSelected = selected === row.id;
              const started = Boolean(row.actual_start);

              return (
                <g
                  key={row.id}
                  onClick={() => setSelected(isSelected ? null : row.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={0}
                    y={y}
                    width={LABEL_WIDTH + scale.width}
                    height={ROW_HEIGHT}
                    fill={isSelected ? "#eff6ff" : "transparent"}
                  />
                  <text x={6} y={y + 16} fontSize={11} fill="#27272a">
                    {`${row.activity_id} ${row.activity}`.slice(0, 40)}
                  </text>

                  {bar.kind === "milestone" ? (
                    <polygon
                      points={`${LABEL_WIDTH + bar.x},${y + 6} ${LABEL_WIDTH + bar.x + 6},${y + 12} ${LABEL_WIDTH + bar.x},${y + 18} ${LABEL_WIDTH + bar.x - 6},${y + 12}`}
                      fill={critical ? "#dc2626" : "#3f3f46"}
                    />
                  ) : bar.kind === "bar" ? (
                    <g>
                      <rect
                        x={LABEL_WIDTH + bar.x}
                        y={y + 6}
                        width={Math.max(bar.width, 2)}
                        height={12}
                        rx={2}
                        fill={critical ? "#fecaca" : "#e4e4e7"}
                        stroke={critical ? "#dc2626" : "#a1a1aa"}
                        // An activity with actual dates is a different kind of
                        // fact from a planned one, and should not read the same.
                        strokeDasharray={started ? undefined : "3 2"}
                      />
                      {row.pct_complete > 0 ? (
                        <rect
                          x={LABEL_WIDTH + bar.x}
                          y={y + 6}
                          width={Math.max(bar.width, 2) * Math.min(row.pct_complete, 100) / 100}
                          height={12}
                          rx={2}
                          fill={critical ? "#dc2626" : "#71717a"}
                        />
                      ) : null}
                    </g>
                  ) : (
                    <text x={LABEL_WIDTH + 4} y={y + 16} fontSize={10} fill="#a1a1aa">
                      no dates
                    </text>
                  )}
                </g>
              );
            })}

            {visibleEdges.map((edge, i) => {
              const from = indexById.get(edge.predecessor);
              const to = indexById.get(edge.successor);
              if (from === undefined || to === undefined) return null;
              const fromRow = shown[from];
              const toRow = shown[to];
              const fromBar = barGeometry(scale, fromRow);
              const toBar = barGeometry(scale, toRow);
              if (fromBar.kind === "none" || toBar.kind === "none") return null;

              const x1 = LABEL_WIDTH + fromBar.x + fromBar.width;
              const y1 = 40 + from * ROW_HEIGHT + 12;
              const x2 = LABEL_WIDTH + toBar.x;
              const y2 = 40 + to * ROW_HEIGHT + 12;
              const mid = Math.max(x1, x2) + 6;

              return (
                <g key={`edge-${i}`}>
                  <path
                    d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={1}
                  />
                  <circle cx={x2} cy={y2} r={2} fill="#2563eb" />
                  {edge.type !== "FS" || edge.lag_days !== 0 ? (
                    <text x={mid + 2} y={(y1 + y2) / 2} fontSize={9} fill="#2563eb">
                      {edge.type}
                      {edge.lag_days ? (edge.lag_days > 0 ? `+${edge.lag_days}` : edge.lag_days) : ""}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <p className="text-[11px] text-neutral-500">
        <Diamond className="mr-1 inline size-3" />
        Bars show the <strong>imported</strong> dates. Click an activity to see what it depends on.
        {freshness === "fresh" ? " The critical path is drawn in red." : null} Shaded columns are
        non-working days from the project calendar.
      </p>
    </div>
  );
}
