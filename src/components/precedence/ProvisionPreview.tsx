"use client";

import { classifyConflict, NoProvisionRecordError } from "@/lib/precedence/classify";
import { PRECEDENCE_CLASS_LABEL } from "@/lib/precedence/labels";
import type {
  ConflictClass,
  ConflictLocus,
  PrecedenceClass,
  PrecedenceProvision,
} from "@/lib/precedence/types";
import { cn } from "@/lib/utils";

/**
 * What this provision would actually DO, shown against worked conflicts.
 *
 * This is the confirmation step. The person recording a provision is checking
 * that the structure they entered means what the manual says. Running the real
 * classifier rather than describing the rules is deliberate: a summary of what
 * the rules "should" do could agree with the manual while the classifier
 * disagrees, which is the failure this screen exists to prevent.
 *
 * Labels come from labels.ts; internal class names never reach the screen.
 */
const CLASS_TONE: Record<PrecedenceClass, string> = {
  precedence_resolvable: "bg-emerald-100 text-emerald-900",
  precedence_ambiguous: "bg-amber-100 text-amber-900",
  precedence_incorporated: "bg-sky-100 text-sky-900",
  requires_clarification: "bg-neutral-200 text-neutral-800",
  no_precedence_provision: "bg-neutral-200 text-neutral-700",
};

const spec = (over: Partial<ConflictLocus> = {}): ConflictLocus => ({ document: "Specifications", ...over });

interface Worked {
  label: string;
  conflictClass: ConflictClass;
  between: [ConflictLocus, ConflictLocus];
  /** Why this case is worth showing. */
  why: string;
}

function workedConflicts(provision: PrecedenceProvision): Worked[] {
  const cases: Worked[] = [
    {
      label: "A specification against a drawing",
      conflictClass: "E1",
      between: [spec(), { document: "Drawings" }],
      why: "The most common conflict on a job, and the one a precedence clause is usually read for.",
    },
    {
      label: "A detail sheet against a plan sheet",
      conflictClass: "E2",
      between: [
        { document: "Large-scale detail drawings", sheet: "A-501" },
        { document: "Small-scale drawings", sheet: "A-101" },
      ],
      why: "Only a clause that ranks drawing types can settle this.",
    },
  ];

  // Show a named override against whatever the sequence ranks first: the point
  // of an override is that it beats it.
  const override = provision.rules.find((r) => r.type === "OVERRIDE");
  const sequence = provision.rules.find((r) => r.type === "RANK_SEQUENCE");
  if (override && override.type === "OVERRIDE" && sequence && sequence.type === "RANK_SEQUENCE") {
    const topOfSequence = sequence.order[0]?.[0];
    if (topOfSequence) {
      cases.push({
        label: `${override.applies_to} against ${topOfSequence}`,
        conflictClass: "E1",
        between: [{ document: override.applies_to }, { document: topOfSequence }],
        why: `${topOfSequence} is first in the sequence, so this shows whether the override really fires before it.`,
      });
    }
  }

  if (provision.scope === "division_scoped" && provision.scope_target) {
    cases.push({
      label: `A conflict outside Division ${provision.scope_target}`,
      conflictClass: "E1",
      between: [spec({ section: "08 71 00" }), { document: "Drawings" }],
      why: "A clause for one division must not be applied to work it does not govern.",
    });
  }

  return cases;
}

type Outcome = { label: string; tone: string; explanation: string };

function outcomeFor(c: Worked, provision: PrecedenceProvision): Outcome {
  try {
    const result = classifyConflict({ conflict_class: c.conflictClass, between: c.between }, [provision]);
    return {
      label: PRECEDENCE_CLASS_LABEL[result.class].label,
      tone: CLASS_TONE[result.class],
      explanation: result.explanation,
    };
  } catch (err) {
    if (!(err instanceof NoProvisionRecordError)) throw err;
    // Previewed alone, a one-division clause cannot answer a conflict outside
    // its division. That is correct behaviour, so it is explained, not shown
    // as a failure.
    return {
      label: "Outside this clause",
      tone: "bg-neutral-100 text-neutral-600",
      explanation:
        "This clause doesn't reach a conflict like this. The project also needs its whole-project " +
        "clause, or a record that the manual has none, before conflicts like this can be classified.",
    };
  }
}

export function ProvisionPreview({ provision }: { provision: PrecedenceProvision }) {
  const cases = workedConflicts(provision);

  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
        What this provision would decide
      </h3>
      <p className="text-[12px] text-neutral-500">
        Check these against the manual before confirming. If any of them is wrong, the structure
        above is wrong — not the wording.
      </p>

      <ul className="space-y-2">
        {cases.map((c) => {
          const outcome = outcomeFor(c, provision);
          return (
            <li key={c.label} className="rounded border border-neutral-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px]">{c.label}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", outcome.tone)}>
                  {outcome.label}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-neutral-700">{outcome.explanation}</p>
              <p className="mt-0.5 text-[11px] text-neutral-400">{c.why}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
