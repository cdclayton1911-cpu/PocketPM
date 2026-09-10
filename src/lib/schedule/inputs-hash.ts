/**
 * A fingerprint of everything the CPM computation consumed.
 *
 * ## Why a hash and not timestamps
 *
 * The persisted CPM columns (cpm_early_start, total_float, is_critical, and the
 * rest) are a cache. A cache that cannot say whether it is fresh is worse than
 * no cache: a stale critical path is indistinguishable from a current one, and
 * the Gantt is exactly the consumer that will read the columns rather than
 * recompute per row.
 *
 * The obvious approach - a `calendar_updated_at` field, or comparing
 * per-collection timestamps - is a convention someone must maintain, and it
 * drifts silently the first time a write path forgets to touch it. **A hash of
 * the inputs cannot drift out of sync with the inputs, because it is the
 * inputs.** Same move as the typed units in 55add07: make the wrong state
 * unrepresentable rather than write a rule about avoiding it.
 *
 * ## Add an input here, not to a list
 *
 * This hashes everything the computation consumes rather than enumerating the
 * things that might change. If you add an input to the CPM engine, add it to
 * `canonicalInputs` below and staleness follows automatically - there is no
 * second list of "things that invalidate the cache" to keep in step, and so no
 * way for the two to disagree.
 *
 * ## What is deliberately NOT hashed
 *
 * Project fields other than the calendar. Renaming a project or editing its
 * contract value changes nothing the CPM reads, and marking the cache stale for
 * it trains people to ignore the marker - which costs more than the stale read
 * it was meant to prevent. A holiday's *label* is excluded for the same reason:
 * it has no effect on any computed date.
 */

import type { ProjectCalendar } from "./calendar";
import type { CpmActivity, CpmRelationship } from "./cpm";

export interface CpmInputs {
  activities: readonly CpmActivity[];
  relationships: readonly CpmRelationship[];
  calendar: ProjectCalendar;
  criticalThreshold?: number;
  projectStart?: string;
}

/**
 * A stable, order-independent string form of the inputs.
 *
 * Sorted deliberately: PocketBase returns rows in whatever order was asked for,
 * and an unsorted hash would differ between two identical reads and report
 * stale on every single one.
 */
export function canonicalInputs(inputs: CpmInputs): string {
  const activities = [...inputs.activities]
    .map((a) =>
      [
        a.id,
        a.duration_days ?? "",
        a.target_start ?? "",
        a.target_finish ?? "",
        a.actual_start ?? "",
        a.actual_finish ?? "",
        a.activity_type ?? "task",
      ].join("\u0001"),
    )
    .sort();

  const relationships = [...inputs.relationships]
    .map((r) => [r.predecessor, r.successor, r.type, r.lag_days ?? 0].join("\u0001"))
    .sort();

  // Only the fields that change an answer. Labels are documentation.
  const workDays = [...(inputs.calendar.work_days ?? [])].sort((a, b) => a - b).join(",");
  const holidays = [...(inputs.calendar.holidays ?? [])]
    .map((h) => h.date)
    .sort()
    .join(",");

  return [
    `activities:${activities.join("\u0002")}`,
    `relationships:${relationships.join("\u0002")}`,
    `work_days:${workDays}`,
    `holidays:${holidays}`,
    `threshold:${inputs.criticalThreshold ?? 0}`,
    `projectStart:${inputs.projectStart ?? ""}`,
  ].join("\u0003");
}

/**
 * FNV-1a over several lanes, giving 96 bits as hex.
 *
 * Not cryptographic and does not need to be: this detects accidental change,
 * not tampering, and anyone able to forge a colliding schedule can already
 * write the columns directly. Hand-rolled to avoid both a dependency and
 * node:crypto, which would stop this module being usable anywhere.
 */
export function hashString(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x85ebca6b) >>> 0;
  }
  // Length is mixed in so two different inputs that happen to converge still
  // differ when they are not the same size.
  const h3 = (text.length * 0x9e3779b1) >>> 0;
  return [h1, h2, h3].map((n) => n.toString(16).padStart(8, "0")).join("");
}

export function hashCpmInputs(inputs: CpmInputs): string {
  return hashString(canonicalInputs(inputs));
}

export type Freshness =
  | { state: "fresh"; hash: string }
  | { state: "stale"; hash: string; storedHash: string | null }
  | { state: "never-computed"; hash: string };

/**
 * Compare the current inputs against what the stored results were computed
 * from. One comparison, and it can fail - which is the whole point.
 */
export function cacheFreshness(
  inputs: CpmInputs,
  storedHash: string | null | undefined,
): Freshness {
  const hash = hashCpmInputs(inputs);
  if (!storedHash) return { state: "never-computed", hash };
  return storedHash === hash ? { state: "fresh", hash } : { state: "stale", hash, storedHash };
}
