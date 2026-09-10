/**
 * Classify a detected conflict against a project's recorded precedence
 * provisions. Pure: no I/O, no database, no LLM.
 *
 * Deliberately decoupled from conflict detection. Provisions are recorded once
 * per project; classification runs per conflict. The two are separately
 * testable and neither imports the other.
 */

import {
  documentMatches,
  normalizeDocumentType,
  type ConflictLocus,
  type DetectedConflict,
  type PrecedenceClassification,
  type PrecedenceProvision,
  type PrecedenceRule,
} from "./types";

function describe(locus: ConflictLocus): string {
  const where = locus.reference ?? locus.section ?? locus.division;
  return where ? `${locus.documentType} (${where})` : locus.documentType;
}

/** The division a locus belongs to: explicit if given, else the section prefix. */
export function divisionOf(locus: ConflictLocus): string | null {
  if (locus.division) return locus.division.trim();
  const section = locus.section?.trim();
  if (!section) return null;
  const first = section.split(/[\s.-]+/)[0];
  return /^\d{2}$/.test(first) ? first : null;
}

/**
 * Does a DIVISION_SCOPED provision reach this conflict?
 *
 * True when EITHER locus sits in the scoped division. A plumbing clause reaches
 * a conflict between the plumbing specification and a drawing showing plumbing
 * work, and the drawing side frequently carries no division of its own.
 *
 * The consequence is deliberate and is the Rees case: a Division 08 door
 * schedule conflict is NOT reached by the Division 22 rule, and must not be
 * reported as if it were.
 */
export function provisionReaches(
  provision: PrecedenceProvision,
  conflict: DetectedConflict,
): boolean {
  if (provision.scope === "NONE_FOUND") return false;
  if (provision.scope !== "DIVISION_SCOPED") return true;

  const target = provision.scope_target?.trim();
  if (!target) return false;
  const targetDivision = target.split(/[\s.-]+/)[0];

  return conflict.between.some((locus) => {
    const division = divisionOf(locus);
    if (division && division === targetDivision) return true;
    // A locus naming the full section matches too, e.g. "22 00 00".
    return Boolean(locus.section && locus.section.trim().startsWith(target));
  });
}

/** DIVISION_SCOPED beats PROJECT_WIDE beats EXTERNAL: the most specific governs. */
const SPECIFICITY: Record<string, number> = {
  DIVISION_SCOPED: 3,
  PROJECT_WIDE: 2,
  EXTERNAL: 1,
  NONE_FOUND: 0,
};

export function selectProvision(
  provisions: readonly PrecedenceProvision[],
  conflict: DetectedConflict,
): PrecedenceProvision | null {
  const applicable = provisions.filter((p) => provisionReaches(p, conflict));
  if (applicable.length === 0) return null;
  return [...applicable].sort(
    (a, b) => (SPECIFICITY[b.scope] ?? 0) - (SPECIFICITY[a.scope] ?? 0),
  )[0];
}

/** Index of the tier containing this locus, or -1. */
function tierIndexFor(order: readonly (readonly string[])[], locus: ConflictLocus): number {
  return order.findIndex((tier) => tier.some((entry) => documentMatches(entry, locus.documentType)));
}

interface RuleOutcome {
  classification: Omit<PrecedenceClassification, "provisionId" | "scope"> | null;
}

function applyRule(
  rule: PrecedenceRule,
  conflict: DetectedConflict,
  provision: PrecedenceProvision,
): RuleOutcome {
  const [a, b] = conflict.between;

  if (rule.type === "OVERRIDE") {
    const matches = conflict.between.filter((l) => documentMatches(rule.applies_to, l.documentType));
    // An override only decides the conflict when exactly ONE side is the
    // overriding document. Both sides means it does not discriminate.
    if (matches.length === 1) {
      return {
        classification: {
          class: "PRECEDENCE_RESOLVABLE",
          governing: matches[0],
          externalInstrument: null,
          explanation:
            `${provision.section} gives ${rule.applies_to} precedence` +
            (rule.precedence === "ABSOLUTE" ? " notwithstanding the order of precedence" : "") +
            `, so ${describe(matches[0])} governs.`,
        },
      };
    }
    return { classification: null };
  }

  if (rule.type === "RANK_SEQUENCE") {
    const ia = tierIndexFor(rule.order, a);
    const ib = tierIndexFor(rule.order, b);
    if (ia === -1 || ib === -1) {
      // One side is not named in the sequence. Fall through rather than guess:
      // a sequence that does not mention a document cannot rank it.
      return { classification: null };
    }
    if (ia === ib) {
      // TIED TIER. This is UCCS: drawings and specifications share a tier, so
      // the sequence cannot settle it and the later rules must.
      return { classification: null };
    }
    const winner = ia < ib ? a : b;
    const loser = ia < ib ? b : a;
    return {
      classification: {
        class: "PRECEDENCE_RESOLVABLE",
        governing: winner,
        externalInstrument: null,
        explanation:
          `${provision.section} ranks ${winner.documentType} above ${loser.documentType}, ` +
          `so ${describe(winner)} governs over ${describe(loser)}.`,
      },
    };
  }

  if (rule.type === "STRINGENCY") {
    return {
      classification: {
        class: "PRECEDENCE_AMBIGUOUS",
        governing: null,
        externalInstrument: null,
        explanation:
          `${provision.section} does not rank these documents against each other. It directs that ` +
          `the more stringent or higher quality requirement applies` +
          (rule.condition ? ` (${rule.condition})` : "") +
          `, which is a comparison the contract does not make for you.`,
      },
    };
  }

  return {
    classification: {
      class: "PRECEDENCE_AMBIGUOUS",
      governing: null,
      externalInstrument: null,
      explanation:
        `${provision.section} reserves this decision to the ${rule.authority}. ` +
        `The documents do not resolve it; the ${rule.authority} must.`,
    },
  };
}

/**
 * Classify one conflict.
 *
 * `provisions` is every provision recorded for the project. Passing an empty
 * array means "searched and found nothing" - NOT "could not search". A caller
 * that failed to load provisions must not call this; see the loader.
 */
export function classifyConflict(
  conflict: DetectedConflict,
  provisions: readonly PrecedenceProvision[],
): PrecedenceClassification {
  const provision = selectProvision(provisions, conflict);

  if (!provision) {
    const scoped = provisions.filter((p) => p.scope === "DIVISION_SCOPED");
    return {
      class: "NO_PRECEDENCE_PROVISION",
      scope: "NONE_FOUND",
      provisionId: null,
      governing: null,
      externalInstrument: null,
      explanation:
        scoped.length > 0
          ? `No precedence provision reaches this conflict. ${scoped.length} provision(s) exist ` +
            `but govern only ${scoped.map((p) => p.scope_target ?? "an unnamed section").join(", ")}.`
          : "No precedence provision was recorded for this project, and none is incorporated by reference.",
    };
  }

  if (provision.scope === "EXTERNAL") {
    const instrument = provision.external_instrument;
    return {
      class: "PRECEDENCE_INCORPORATED",
      scope: "EXTERNAL",
      provisionId: provision.id,
      governing: null,
      externalInstrument: instrument,
      explanation:
        `${provision.section} incorporates ${instrument?.name ?? "an external instrument"}` +
        (instrument?.edition ? ` (${instrument.edition})` : "") +
        ` by reference. The governing provision is not in this document set and must be consulted separately.`,
    };
  }

  for (const rule of provision.rules) {
    const { classification } = applyRule(rule, conflict, provision);
    if (classification) {
      return { ...classification, scope: provision.scope, provisionId: provision.id };
    }
  }

  // A provision applies here but nothing in it addresses these two documents.
  // Distinct from NO_PRECEDENCE_PROVISION, which means nothing reached the
  // conflict at all.
  return {
    class: "REQUIRES_CLARIFICATION",
    scope: provision.scope,
    provisionId: provision.id,
    governing: null,
    externalInstrument: null,
    explanation:
      `${provision.section} applies to this conflict but does not address ` +
      `${conflict.between.map((l) => l.documentType).join(" versus ")}. A clarification is required.`,
  };
}
