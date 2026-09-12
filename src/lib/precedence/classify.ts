/**
 * Classify a detected conflict against a project's recorded precedence
 * provisions. Pure: no I/O, no database, no LLM.
 *
 * Deliberately decoupled from conflict detection. Provisions are recorded once
 * per project; classification runs per conflict. The two are separately
 * testable and neither imports the other.
 */

import { RULE_PROVENANCE } from "./provenance";
import {
  documentMatches,
  type ConflictLocus,
  type DetectedConflict,
  type PrecedenceClassification,
  type PrecedenceProvision,
  type PrecedenceRule,
} from "./types";

/**
 * The project has no provision record that can answer this conflict.
 *
 * Taxonomy v1.2: absence of a record is an error, not an implicit
 * "no precedence provision". Nobody-has-looked and looked-and-found-nothing
 * are opposite findings, and only the second is a finding. The product turns
 * this into an onboarding prompt ("add your contract's order-of-precedence
 * clause"), never an error screen.
 */
export class NoProvisionRecordError extends Error {
  readonly kind: "no_records" | "no_none_found";

  constructor(kind: "no_records" | "no_none_found", message: string) {
    super(message);
    this.name = "NoProvisionRecordError";
    this.kind = kind;
  }
}

function describe(locus: ConflictLocus): string {
  const where = locus.sheet ?? locus.detail ?? locus.section ?? locus.paragraph;
  return where ? `${locus.document} (${where})` : locus.document;
}

/** The CSI division a locus sits in, from its section number. Null if none. */
export function divisionOf(locus: ConflictLocus): string | null {
  const section = locus.section?.trim();
  if (!section) return null;
  const first = section.split(/[\s.-]+/)[0];
  return /^\d{2}$/.test(first) ? first : null;
}

/**
 * Does a provision reach this conflict?
 *
 * A division-scoped provision reaches it when EITHER locus sits in its
 * division: a plumbing clause reaches a plumbing specification against the
 * drawing that shows the plumbing, and drawings usually carry no division of
 * their own. A Division 08 door schedule conflict is NOT reached by the
 * Division 22 rule (Rees), and must not be reported as if it were.
 */
export function provisionReaches(provision: PrecedenceProvision, conflict: DetectedConflict): boolean {
  if (provision.scope === "none_found") return false;
  if (provision.scope !== "division_scoped") return true;

  const target = provision.scope_target?.trim();
  if (!target) return false;
  const targetDivision = target.split(/[\s.-]+/)[0];

  return conflict.between.some((locus) => {
    const division = divisionOf(locus);
    if (division && division === targetDivision) return true;
    return Boolean(locus.section && locus.section.trim().startsWith(target));
  });
}

/** The most specific applicable provision governs. */
const SPECIFICITY: Record<string, number> = {
  division_scoped: 3,
  project_wide: 2,
  external: 1,
  none_found: 0,
};

export function selectProvision(
  provisions: readonly PrecedenceProvision[],
  conflict: DetectedConflict,
): PrecedenceProvision | null {
  const applicable = provisions.filter((p) => provisionReaches(p, conflict));
  if (applicable.length === 0) return null;
  return [...applicable].sort((a, b) => (SPECIFICITY[b.scope] ?? 0) - (SPECIFICITY[a.scope] ?? 0))[0];
}

function tierIndexFor(order: readonly (readonly string[])[], locus: ConflictLocus): number {
  return order.findIndex((tier) => tier.some((entry) => documentMatches(entry, locus.document)));
}

type PartialClassification = Pick<
  PrecedenceClassification,
  "class" | "governingIndex" | "explanation" | "externalInstrument"
>;

export interface ClassifyOptions {
  /**
   * Document names known to be present in this set, for DEFER. Whether a
   * document is available is a fact about the SET, not the clause, so this
   * changes the wording of the clarification, never the class.
   */
  availableDocuments?: string[];
}

function indexOf(conflict: DetectedConflict, locus: ConflictLocus): 0 | 1 {
  return conflict.between[0] === locus ? 0 : 1;
}

function applyRule(
  rule: PrecedenceRule,
  conflict: DetectedConflict,
  provision: PrecedenceProvision,
  options: ClassifyOptions,
): PartialClassification | null {
  const [a, b] = conflict.between;

  if (rule.type === "OVERRIDE") {
    const matches = conflict.between.filter((l) => documentMatches(rule.applies_to, l.document));
    // Decides only when exactly ONE side is the overriding document.
    if (matches.length !== 1) return null;
    return {
      class: "precedence_resolvable",
      governingIndex: indexOf(conflict, matches[0]),
      externalInstrument: null,
      explanation:
        `${provision.section} gives ${rule.applies_to} precedence` +
        (rule.precedence === "ABSOLUTE" ? " notwithstanding the order of precedence" : "") +
        `, so ${describe(matches[0])} governs.`,
    };
  }

  if (rule.type === "RANK_SEQUENCE") {
    const ia = tierIndexFor(rule.order, a);
    const ib = tierIndexFor(rule.order, b);
    // A sequence that does not name a document cannot rank it; a TIED tier
    // (UCCS: drawings and specifications together) cannot settle it. Either
    // way the later rules decide.
    if (ia === -1 || ib === -1 || ia === ib) return null;
    const winner = ia < ib ? a : b;
    const loser = ia < ib ? b : a;
    return {
      class: "precedence_resolvable",
      governingIndex: indexOf(conflict, winner),
      externalInstrument: null,
      explanation:
        `${provision.section} ranks ${winner.document} above ${loser.document}, ` +
        `so ${describe(winner)} governs over ${describe(loser)}.`,
    };
  }

  if (rule.type === "STRINGENCY") {
    return {
      class: "precedence_ambiguous",
      governingIndex: null,
      externalInstrument: null,
      explanation:
        `${provision.section} does not rank these documents against each other. It directs that ` +
        `the more stringent or higher quality requirement applies` +
        (rule.condition ? ` (${rule.condition})` : "") +
        `, which is a comparison the contract does not make for you.`,
    };
  }

  if (rule.type === "DISCRETION") {
    return {
      class: "precedence_ambiguous",
      governingIndex: null,
      externalInstrument: null,
      explanation:
        `${provision.section} reserves this decision to the ${rule.authority}. ` +
        `The documents do not resolve it; the ${rule.authority} must.`,
    };
  }

  // DEFER: always a clarification that NAMES the target. A silent fall-through
  // would report "no rule addressed this" when a rule addressed it precisely.
  const available = options.availableDocuments ?? null;
  const targetPresent =
    available === null
      ? null
      : available.some((doc) => documentMatches(rule.to, doc) || documentMatches(doc, rule.to));
  const condition = rule.condition ? ` ${rule.condition}` : "";
  return {
    class: "requires_clarification",
    governingIndex: null,
    externalInstrument: null,
    explanation:
      targetPresent === true
        ? `${provision.section} defers to ${rule.to}${condition}. ${rule.to} is in this document ` +
          `set, so the governing requirement is there rather than here.`
        : targetPresent === false
          ? `${provision.section} defers to ${rule.to}${condition}, and ${rule.to} is NOT in this ` +
            `document set. Nothing here resolves the conflict.`
          : `${provision.section} defers to ${rule.to}${condition}. Whether ${rule.to} is available ` +
            `is a fact about the document set that this cannot determine — check it and consult ` +
            `${rule.to} if present.`,
  };
}

/**
 * Classify one conflict.
 *
 * Throws NoProvisionRecordError when the project has no record that can answer
 * it: none at all, or none that reaches this conflict and no none_found record
 * to cite instead. Every classification this returns cites a provision.
 */
export function classifyConflict(
  conflict: DetectedConflict,
  provisions: readonly PrecedenceProvision[],
  options: ClassifyOptions = {},
): PrecedenceClassification {
  if (provisions.length === 0) {
    throw new NoProvisionRecordError(
      "no_records",
      "This project has no precedence provision record. Record the contract's order-of-precedence " +
        "clause, or record that the manual was searched and has none (scope none_found).",
    );
  }

  const provision = selectProvision(provisions, conflict);

  if (!provision) {
    const noneFound = provisions.find((p) => p.scope === "none_found");
    const scoped = provisions.filter((p) => p.scope === "division_scoped");
    const scopedNote = scoped.length
      ? `${scoped.length} provision(s) exist but govern only ${scoped.map((p) => p.scope_target ?? "an unnamed section").join(", ")}.`
      : "";

    if (!noneFound) {
      throw new NoProvisionRecordError(
        "no_none_found",
        `No recorded provision reaches this ${conflict.conflict_class} conflict. ${scopedNote} ` +
          "Record that the rest of the manual was searched (scope none_found), or record the " +
          "clause that covers it.",
      );
    }

    return {
      class: "no_precedence_provision",
      scope: "none_found",
      provisionId: noneFound.id,
      governingIndex: null,
      provisional: false,
      provisionalReason: null,
      externalInstrument: null,
      explanation:
        (scoped.length ? `No precedence provision reaches this conflict. ${scopedNote} ` : "") +
        `The manual was searched and has no provision that covers it (${noneFound.section}` +
        `${noneFound.page ? `, p.${noneFound.page}` : ""}).`,
    };
  }

  if (provision.scope === "external") {
    const instrument = provision.external_instrument;
    return {
      class: "precedence_incorporated",
      scope: "external",
      provisionId: provision.id,
      governingIndex: null,
      provisional: false,
      provisionalReason: null,
      externalInstrument: instrument,
      explanation:
        `${provision.section} incorporates ${instrument?.name ?? "an external instrument"}` +
        (instrument?.edition ? ` (${instrument.edition})` : "") +
        " by reference. The governing provision is not in this document set and must be consulted separately.",
    };
  }

  for (const rule of provision.rules) {
    const outcome = applyRule(rule, conflict, provision, options);
    if (outcome) {
      const provenance = RULE_PROVENANCE[rule.type];
      return {
        ...outcome,
        scope: provision.scope,
        provisionId: provision.id,
        provisional: provenance.provisional,
        provisionalReason: provenance.provisional
          ? `Decided by a ${rule.type} rule, observed in ${provenance.observedIn} of 4 manuals (${provenance.manuals.join(", ")}).`
          : null,
      };
    }
  }

  // A provision applies but nothing in it addresses these two documents.
  // Distinct from no_precedence_provision, where nothing reached the conflict.
  return {
    class: "requires_clarification",
    scope: provision.scope,
    provisionId: provision.id,
    governingIndex: null,
    provisional: false,
    provisionalReason: null,
    externalInstrument: null,
    explanation:
      `${provision.section} applies to this conflict but does not address ` +
      `${conflict.between.map((l) => l.document).join(" versus ")}. A clarification is required.`,
  };
}
