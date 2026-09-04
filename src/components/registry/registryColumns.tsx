import { Paperclip } from "lucide-react";
import type { Column } from "@/components/shared/DataTable";
import { humanizeStatus, StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  EXPIRY_CLASS,
  expiryUrgency,
  formatBondCapacity,
  formatQualityScore,
  STATUS_TONE,
} from "@/lib/registry-format";
import type { Subcontractor } from "@/types";

/**
 * Column definitions for the registry table.
 *
 * Extracted from RegistryClient to keep that component under the 200-line limit
 * — and because "the columns" and "the page behaviour" are genuinely separate
 * concerns. The other 25 modules should follow this split.
 */
export function buildRegistryColumns({
  onEdit,
  onDeactivate,
}: {
  onEdit: (row: Subcontractor) => void;
  onDeactivate: (id: string) => void;
}): Column<Subcontractor>[] {
  return [
    {
      key: "company",
      header: "Company",
      cell: (row) => <span className="font-semibold">{row.company_name}</span>,
    },
    { key: "trade", header: "Trade", cell: (row) => row.trade || "—" },
    {
      key: "license",
      header: "License",
      cell: (row) =>
        row.license_number ? (
          <StatusBadge tone="success">Active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">On file</StatusBadge>
        ),
    },
    {
      key: "insurance",
      header: "Ins. expires",
      cell: (row) => {
        const urgency = expiryUrgency(row.insurance_expiry);
        if (urgency === "none") return <span className="text-muted-foreground">—</span>;
        const suffix =
          urgency === "expired" ? " — expired" : urgency === "critical" || urgency === "warning" ? " !" : "";
        return (
          <span className={EXPIRY_CLASS[urgency]}>
            {row.insurance_expiry}
            {suffix}
          </span>
        );
      },
    },
    {
      key: "bond",
      header: "Bond cap.",
      align: "right",
      cell: (row) => formatBondCapacity(row.bond_capacity),
    },
    {
      key: "emr",
      header: "EMR",
      align: "right",
      cell: (row) => (row.emr ? row.emr.toFixed(2) : "—"),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      cell: (row) => {
        const { label, className } = formatQualityScore(row.quality_score);
        return <span className={className}>{label}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? "neutral"}>
          {humanizeStatus(row.status)}
        </StatusBadge>
      ),
    },
    {
      key: "files",
      header: "Docs",
      cell: (r) =>
        r.documents?.length ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Paperclip className="size-3" aria-hidden />
            {r.documents.length}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEdit(row)}>
            Edit
          </Button>
          {row.status !== "inactive" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onDeactivate(row.id)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
}
