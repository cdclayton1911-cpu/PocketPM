import type { LucideIcon } from "lucide-react";

/**
 * Shown when a list has no rows. Deliberately always offers a next action —
 * the brief's "no blank screens".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon ? <Icon className="mb-3 size-8 text-muted-foreground/60" aria-hidden /> : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
