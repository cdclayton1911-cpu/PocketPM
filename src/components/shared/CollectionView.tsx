"use client";

import { Plus, type LucideIcon } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard, type StatTone } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The repeated shape of a module: stat row, a card with a filter and an add
 * button, a table with loading/empty/error handling, and an optional insights
 * panel underneath.
 *
 * Extracted after the Registry proved the structure, so the remaining modules
 * express only what differs — their columns, stats, and form. Anything genuinely
 * module-specific goes in `insights` or replaces this component outright; this
 * is a convenience, not a straitjacket.
 */

export interface StatSpec {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
}

export interface FilterSpec<F extends string> {
  value: F;
  label: string;
}

interface CollectionViewProps<T, F extends string> {
  title: string;
  /** Query result, so this can show the right loading and error states. */
  query: Pick<UseQueryResult<T[]>, "data" | "isLoading" | "isError" | "error" | "refetch">;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Rows after filtering. Kept outside so each module owns its filter logic. */
  rows: T[];
  stats?: StatSpec[];
  filters?: readonly FilterSpec<F>[];
  filter?: F;
  onFilterChange?: (value: F) => void;
  onAdd?: () => void;
  addLabel?: string;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Rendered below the table — completeness bars, alerts, charts. */
  insights?: React.ReactNode;
  /** Dialogs and other overlays. */
  children?: React.ReactNode;
}

export function CollectionView<T, F extends string>({
  title,
  query,
  columns,
  rowKey,
  rows,
  stats,
  filters,
  filter,
  onFilterChange,
  onAdd,
  addLabel = "Add",
  emptyIcon,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  rowClassName,
  insights,
  children,
}: CollectionViewProps<T, F>) {
  const all = query.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {stats?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} tone={stat.tone} />
          ))}
        </div>
      ) : null}

      <Card className="rounded-r12">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {filters?.length && onFilterChange ? (
              <label>
                <span className="sr-only">Filter</span>
                <select
                  value={filter}
                  onChange={(event) => onFilterChange(event.target.value as F)}
                  className="h-8 rounded-r6 border border-input bg-card px-2 text-xs"
                >
                  {filters.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onAdd ? (
              <Button size="sm" className="h-8 text-xs" onClick={onAdd}>
                <Plus className="size-3.5" aria-hidden /> {addLabel}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {query.isError ? (
            // An explicit failure, never a silently empty table.
            <div className="p-4">
              <p className="mb-3 rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
                {query.error instanceof Error ? query.error.message : "Could not load this list."}
              </p>
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={rowKey}
              loading={query.isLoading}
              rowClassName={rowClassName}
              empty={
                all.length === 0 ? (
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={
                      onAdd ? (
                        <Button size="sm" onClick={onAdd}>
                          <Plus className="size-3.5" aria-hidden /> {addLabel}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  // Distinguishes "no data at all" from "the filter excluded
                  // everything" — otherwise a filter looks like data loss.
                  <EmptyState
                    icon={emptyIcon}
                    title="No matches"
                    description="Nothing matches that filter. Try a different one."
                  />
                )
              }
            />
          )}
        </CardContent>
      </Card>

      {insights}
      {children}
    </div>
  );
}
