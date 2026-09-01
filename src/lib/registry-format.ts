import type { BadgeTone } from "@/components/shared/StatusBadge";
import type { Subcontractor, SubcontractorStatus } from "@/types";

/**
 * Display rules for the Registry, ported from the prototype's _renderRegistry()
 * and _renderRegistryStats().
 *
 * Pure functions, deliberately separate from the components: the thresholds are
 * the domain logic worth getting right, and keeping them here makes them
 * readable and testable without rendering anything.
 */

/** Whole days from today until an ISO date. Negative when already past. */
export function daysUntil(isoDate: string, now = new Date()): number | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

export type ExpiryUrgency = "expired" | "critical" | "warning" | "ok" | "none";

/**
 * Prototype thresholds: red at 14 days or less, orange at 30 or less,
 * with expired called out separately.
 */
export function expiryUrgency(isoDate: string, now = new Date()): ExpiryUrgency {
  const days = daysUntil(isoDate, now);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 14) return "critical";
  if (days <= 30) return "warning";
  return "ok";
}

export const EXPIRY_CLASS: Record<ExpiryUrgency, string> = {
  expired: "font-bold text-danger",
  critical: "font-bold text-danger",
  warning: "font-semibold text-caution",
  ok: "text-foreground",
  none: "text-muted-foreground",
};

/** `$4.2M` / `$850K` / `—`, as the prototype formats bond capacity. */
export function formatBondCapacity(value: number | undefined | null): string {
  if (!value || value <= 0) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

/**
 * Quality score colour: green at 85+, orange at 70+, red below.
 *
 * NOTE: PocketBase returns 0 for an unset number, so a genuine score of 0 and
 * "not scored yet" are indistinguishable. Both render as "—", matching the
 * prototype. Representing a real zero would need a schema change.
 */
export function formatQualityScore(score: number | undefined | null): {
  label: string;
  className: string;
} {
  if (!score || score <= 0) return { label: "—", className: "text-muted-foreground" };
  if (score >= 85) return { label: `${score}/100`, className: "font-semibold text-success" };
  if (score >= 70) return { label: `${score}/100`, className: "font-semibold text-caution" };
  return { label: `${score}/100`, className: "font-semibold text-danger" };
}

export const STATUS_TONE: Record<SubcontractorStatus, BadgeTone> = {
  qualified: "success",
  renewal_due: "warning",
  pending_docs: "info",
  disqualified: "danger",
  inactive: "neutral",
};

export interface RegistryStats {
  total: number;
  qualified: number;
  expiring30: number;
  pendingDocs: number;
}

/** The four stat cards. Excludes inactive rows, which are soft-deleted. */
export function computeStats(rows: Subcontractor[], now = new Date()): RegistryStats {
  const active = rows.filter((row) => row.status !== "inactive");
  return {
    total: active.length,
    qualified: active.filter((row) => row.status === "qualified").length,
    expiring30: active.filter((row) => {
      const days = daysUntil(row.insurance_expiry, now);
      return days !== null && days >= 0 && days <= 30;
    }).length,
    pendingDocs: active.filter((row) => row.status === "pending_docs").length,
  };
}

/** The five fields the prototype measures completeness across. */
export const COMPLETENESS_FIELDS: { key: keyof Subcontractor; label: string }[] = [
  { key: "insurance_expiry", label: "Insurance certificates" },
  { key: "bond_capacity", label: "Bond capacity" },
  { key: "emr", label: "EMR documentation" },
  { key: "license_number", label: "License number" },
  { key: "contact_email", label: "Contact email" },
];

export function computeCompleteness(rows: Subcontractor[]) {
  const active = rows.filter((row) => row.status !== "inactive");
  return COMPLETENESS_FIELDS.map(({ key, label }) => {
    const filled = active.filter((row) => {
      const value = row[key];
      return typeof value === "number" ? value > 0 : Boolean(value);
    }).length;
    return {
      label,
      filled,
      total: active.length,
      percent: active.length === 0 ? 0 : Math.round((filled / active.length) * 100),
    };
  });
}

export interface RegistryAlert {
  id: string;
  tone: BadgeTone;
  message: string;
}

/** Expiration and A401 alerts, most urgent first. */
export function computeAlerts(rows: Subcontractor[], now = new Date()): RegistryAlert[] {
  const alerts: RegistryAlert[] = [];

  for (const row of rows.filter((r) => r.status !== "inactive")) {
    const days = daysUntil(row.insurance_expiry, now);

    if (days !== null && days < 0) {
      alerts.push({
        id: `${row.id}-expired`,
        tone: "danger",
        message: `${row.company_name} — insurance expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`,
      });
    } else if (days !== null && days <= 14) {
      alerts.push({
        id: `${row.id}-critical`,
        tone: "danger",
        message: `${row.company_name} — insurance expires in ${days} day${days === 1 ? "" : "s"}`,
      });
    } else if (days !== null && days <= 30) {
      alerts.push({
        id: `${row.id}-warning`,
        tone: "warning",
        message: `${row.company_name} — insurance expires in ${days} days`,
      });
    }

    if (row.a401_status === "not_executed") {
      alerts.push({
        id: `${row.id}-a401`,
        tone: "warning",
        message: `${row.company_name} — A401 not executed. Work should not proceed.`,
      });
    }
  }

  const order: Record<string, number> = { danger: 0, warning: 1 };
  return alerts.sort((a, b) => (order[a.tone] ?? 2) - (order[b.tone] ?? 2));
}
