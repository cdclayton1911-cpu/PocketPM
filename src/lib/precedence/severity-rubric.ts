/**
 * The severity rubric: how much a conflict matters to a GC.
 *
 * A product requirement as well as a praxis one — severity is what makes a
 * conflict list actionable. Unused until detection exists: nothing in
 * PocketPM finds conflicts yet, so nothing applies this. It is here so the
 * first detector has one definition to work from, not several.
 *
 * Severity deliberately does NOT consider the schedule or critical path, the
 * likelihood of a dispute, or cost estimates. It asks what is at stake in the
 * work itself.
 */

import { SEVERITY_BANDS, type ConflictClass, type E1Subtype, type SeverityBand } from "./vocabulary";

export const SEVERITY_RUBRIC = `Assign one severity band to the conflict.

low — pricing exposure only.
medium — rework or delay likely if built as shown.
high — life safety, code compliance, or structural adequacy implicated.

When criteria from more than one band apply, the higher band governs. Any fire-rating
performance_rating conflict is high, whatever it costs to fix. A beneficial_exceedance
conflict is low unless a higher-band criterion also applies.

Judge what is at stake in the work itself. Do not weigh the schedule, whether the conflict is
likely to be disputed, or what it would cost.`;

const ORDER: Record<SeverityBand, number> = { low: 0, medium: 1, high: 2 };

/** The higher band governs. An empty list means nothing beyond pricing: low. */
export function highestBand(bands: readonly SeverityBand[]): SeverityBand {
  return bands.reduce<SeverityBand>((best, b) => (ORDER[b] > ORDER[best] ? b : best), "low");
}

/**
 * Apply the rubric's tie-break and defaults to the criteria a reviewer found.
 *
 * `criteria` are the bands whose conditions the conflict meets. A fire-rated
 * performance_rating conflict is high regardless of the rest; a
 * beneficial_exceedance conflict stays low unless a criterion lifts it.
 */
export function resolveSeverity(
  criteria: readonly SeverityBand[],
  opts: { subtype?: E1Subtype | null; fireRated?: boolean } = {},
): SeverityBand {
  const levels: SeverityBand[] = [...criteria];
  if (opts.subtype === "performance_rating" && opts.fireRated) levels.push("high");
  return highestBand(levels);
}

/** Where a few-shot example came from. Required on every example. */
export type ExampleSource = "aec_bench:wcu" | "aec_bench:uccs" | "aec_bench:north_macon" | "aec_bench:rees" | "synthetic";

export interface SeverityExample {
  description: string;
  conflict_class: ConflictClass;
  conflict_subtype: E1Subtype | null;
  band: SeverityBand;
  rationale: string;
  /**
   * Provenance, required. Only the four AEC-Bench projects or synthetic
   * examples — never seeded test cases or RFI-log content.
   */
  source: ExampleSource;
}

/**
 * Few-shot examples. All synthetic: the four AEC-Bench manuals were read for
 * their precedence clauses, not their conflicts, so no real conflict from them
 * has been transcribed. Replace or extend with `aec_bench:<project>` examples
 * as they are.
 */
export const SEVERITY_EXAMPLES: SeverityExample[] = [
  {
    description:
      "The door hardware section calls for 1-hour fire-rated door assemblies at the stair; the door schedule shows those doors unrated.",
    conflict_class: "E1",
    conflict_subtype: "performance_rating",
    band: "high",
    rationale: "A fire-rating conflict is high regardless of what it costs to fix: life safety and code.",
    source: "synthetic",
  },
  {
    description:
      "The framing section calls for 16-gauge studs at the shear walls; the structural detail notes 20-gauge.",
    conflict_class: "E1",
    conflict_subtype: "material_thickness",
    band: "high",
    rationale: "Structural adequacy of a lateral system is implicated.",
    source: "synthetic",
  },
  {
    description: "Two floor plans show different outlet spacing along the same office wall.",
    conflict_class: "E2",
    conflict_subtype: null,
    band: "medium",
    rationale: "Built from the wrong sheet, the boxes get moved: rework, no safety or code issue.",
    source: "synthetic",
  },
  {
    description: "The finish section calls for porcelain tile in the corridor; the finish plan shows vinyl composition tile.",
    conflict_class: "E1",
    conflict_subtype: "material_type",
    band: "medium",
    rationale: "Installed as drawn, the floor comes up if the specification governs.",
    source: "synthetic",
  },
  {
    description:
      "The concrete section requires Grade 60 reinforcing; the drawings note Grade 75, stronger than required.",
    conflict_class: "E1",
    conflict_subtype: "beneficial_exceedance",
    band: "low",
    rationale: "Exceeding the requirement is pricing exposure only, and no higher criterion applies.",
    source: "synthetic",
  },
  {
    description: "Two specification sections name different manufacturers for the same interior paint.",
    conflict_class: "E3",
    conflict_subtype: null,
    band: "low",
    rationale: "Either product meets the requirement; the difference is price.",
    source: "synthetic",
  },
];

/** Exported for the test that every band has at least one example. */
export const SEVERITY_BAND_VALUES = SEVERITY_BANDS;
