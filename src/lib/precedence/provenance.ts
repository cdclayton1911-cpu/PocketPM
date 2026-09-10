/**
 * How much evidence each construct rests on.
 *
 * Four project manuals establish HETEROGENEITY, not frequency. A construct seen
 * in one of the four is a real observation and a poor basis for generalisation,
 * and the spec asks that such values be flagged provisional.
 *
 * The counts are the number of the four manuals (WCU, UCCS, North Macon, Rees)
 * in which the construct was actually observed. They are not estimates.
 *
 * This lives in code rather than as a column so the flag travels with a
 * classification. A note in a specification is read once; a field on the
 * finding is read every time the finding is.
 */

import type { PrecedenceRule } from "./types";

export interface Provenance {
  /** Manuals, of four, in which this was observed. */
  observedIn: number;
  /** Which ones, so the claim is checkable. */
  manuals: string[];
  /** One observation is not a pattern. */
  provisional: boolean;
  note: string;
}

export const RULE_PROVENANCE: Record<PrecedenceRule["type"], Provenance> = {
  RANK_SEQUENCE: {
    observedIn: 2,
    manuals: ["WCU Quad Stair", "UCCS"],
    provisional: false,
    note: "Two manuals, structurally different — WCU all singleton tiers, UCCS with a tied tier.",
  },
  STRINGENCY: {
    observedIn: 2,
    manuals: ["UCCS", "Rees"],
    provisional: false,
    note: "Project-wide in UCCS, division-scoped in Rees.",
  },
  OVERRIDE: {
    observedIn: 1,
    manuals: ["UCCS"],
    provisional: true,
    note:
      "Only UCCS (Article 52 Special Provisions, plus change orders). Single-observation: " +
      "the marker applies here for the same reason it applies to DEFER.",
  },
  DISCRETION: {
    observedIn: 1,
    manuals: ["UCCS"],
    provisional: true,
    note: "Only UCCS, deferring to the Architect/Engineer.",
  },
  DEFER: {
    observedIn: 1,
    manuals: ["Rees"],
    provisional: true,
    note: 'Only Rees 22 00 00, deferring to Division 01 "when available".',
  },
};

/** Rule types resting on a single manual. */
export function provisionalRuleTypes(): PrecedenceRule["type"][] {
  return (Object.keys(RULE_PROVENANCE) as PrecedenceRule["type"][]).filter(
    (t) => RULE_PROVENANCE[t].provisional,
  );
}
