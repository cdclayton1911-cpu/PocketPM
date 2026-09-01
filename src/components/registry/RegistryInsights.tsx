import { CheckCircle2 } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeAlerts, computeCompleteness } from "@/lib/registry-format";
import { cn } from "@/lib/utils";
import type { Subcontractor } from "@/types";

/** Registry Completeness and Expiration Alerts, as in the prototype. */
export function RegistryInsights({ rows }: { rows: Subcontractor[] }) {
  const completeness = computeCompleteness(rows);
  const alerts = computeAlerts(rows);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="rounded-r12">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Registry completeness</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {completeness[0]?.total === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Add a subcontractor to see document completeness.
            </p>
          ) : (
            completeness.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-semibold">
                    {row.filled}/{row.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded",
                      row.percent === 100 ? "bg-success" : row.percent >= 60 ? "bg-primary" : "bg-caution",
                    )}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-r12">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Expiration alerts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              All insurance and A401s current.
            </div>
          ) : (
            // Cap the list so one bad project cannot produce an endless wall.
            alerts.slice(0, 6).map((alert) => (
              <div key={alert.id} className="flex items-start gap-2 text-[13px]">
                <StatusBadge tone={alert.tone}>{alert.tone === "danger" ? "Urgent" : "Soon"}</StatusBadge>
                <span className="text-muted-foreground">{alert.message}</span>
              </div>
            ))
          )}
          {alerts.length > 6 ? (
            <p className="text-xs text-muted-foreground">+{alerts.length - 6} more</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
