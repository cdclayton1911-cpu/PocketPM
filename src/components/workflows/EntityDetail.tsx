import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ApprovalPanel } from "@/components/workflows/ApprovalPanel";
import { Card } from "@/components/ui/card";

/**
 * A minimal detail view, created because the approval panel needed a host.
 *
 * Submittals and RFIs were list-plus-dialog with no per-record route, so there
 * was nothing to embed a workflow into and nothing for the approvals inbox to
 * link to. This is deliberately thin — enough identity to know what you are
 * approving, plus the panel. It is not a replacement for the edit dialog.
 */
export function EntityDetail({
  entityType,
  entityId,
  currentUserId,
  backHref,
  title,
  subtitle,
  fields,
}: {
  entityType: "submittal" | "rfi";
  entityId: string;
  currentUserId: string;
  backHref: string;
  title: string;
  subtitle?: string;
  fields: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href={backHref} className="inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="size-3" /> Back
      </Link>

      <Card className="p-4">
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-neutral-600">{subtitle}</p> : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{f.label}</dt>
              <dd className="text-neutral-800">{f.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ApprovalPanel entityType={entityType} entityId={entityId} currentUserId={currentUserId} />
    </div>
  );
}
