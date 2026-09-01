import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "caution" | "danger";

const VALUE_TONE: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  caution: "text-caution",
  danger: "text-danger",
};

/**
 * The prototype's `.stat` card: small label, large value, optional sub-label.
 * Used across every module's header row.
 */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  subTone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  subTone?: StatTone;
}) {
  return (
    <div className="rounded-r8 border border-border bg-card p-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("text-[23px] font-bold leading-none", VALUE_TONE[tone])}>{value}</div>
      {sub ? (
        <div className={cn("mt-1 text-[11px]", subTone === "default" ? "text-muted-foreground" : VALUE_TONE[subTone])}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
