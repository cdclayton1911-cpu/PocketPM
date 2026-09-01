import { cn } from "@/lib/utils";

/**
 * The prototype's badge palette, named by meaning rather than by colour.
 *
 * Maps to the prototype's classes: success=bsuc, warning=bwrn, info=binf,
 * danger=bdan, neutral=bnet, teal=btea.
 */
export type BadgeTone = "success" | "warning" | "caution" | "info" | "danger" | "neutral" | "teal";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  caution: "bg-caution-subtle text-caution",
  info: "bg-info-subtle text-info",
  danger: "bg-danger-subtle text-danger",
  neutral: "bg-neutral-subtle text-neutral",
  teal: "bg-teal-subtle text-teal",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-[7px] py-0.5 text-[11px] font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Turn a snake_case enum value into a readable label: pending_docs -> Pending docs. */
export function humanizeStatus(value: string): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
