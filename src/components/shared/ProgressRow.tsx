import { cn } from "@/lib/utils";

/**
 * Labelled progress bar, as used by the prototype's health panels.
 *
 * `tone` is explicit rather than derived from the percentage: for some metrics
 * high is good (inspection pass rate) and for others high is bad (contract
 * growth), so the caller decides.
 */
export function ProgressRow({
  label,
  value,
  percent,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  percent: number;
  tone?: "default" | "success" | "warning" | "caution" | "danger";
}) {
  const bar = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    caution: "bg-caution",
    danger: "bg-danger",
  }[tone];

  const text = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    caution: "text-caution",
    danger: "text-danger",
  }[tone];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold", text)}>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-secondary">
        {/* Clamped: a percentage over 100 would otherwise overflow its track. */}
        <div className={cn("h-full rounded", bar)} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}
