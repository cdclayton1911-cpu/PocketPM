import { cn } from "@/lib/utils";

/**
 * A typed table, not a data grid.
 *
 * `@tanstack/react-table` is not in the approved stack, so this is columns plus
 * rows with loading and empty handling — no sorting, virtualisation, or column
 * resizing. It exists so all 26 modules render lists the same way, including
 * their loading and empty states.
 */
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. Returning a string is fine; anything React can render works. */
  cell: (row: T) => React.ReactNode;
  /** Right-align numeric columns. */
  align?: "left" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Shown instead of rows while the first load is in flight. */
  loading?: boolean;
  /** Shown when there are no rows and we are not loading. */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Per-row extra classes, e.g. tinting a life-safety row. */
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  if (loading) {
    return <TableSkeleton columns={columns.length} />;
  }

  if (rows.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap border-b border-border bg-secondary px-[11px] py-[7px] text-left text-[11px] font-semibold text-muted-foreground",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border last:border-b-0 hover:bg-secondary",
                onRowClick && "cursor-pointer",
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-[11px] py-2 align-middle",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="animate-pulse space-y-2 p-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div key={colIndex} className="h-4 flex-1 rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}
