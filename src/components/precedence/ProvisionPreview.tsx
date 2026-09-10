"use client";

import { classifyConflict } from "@/lib/precedence/classify";
import type { ConflictClass, ConflictLocus, PrecedenceProvision } from "@/lib/precedence/types";
import { cn } from "@/lib/utils";

/**
 * What this provision would actually DO, shown against worked conflicts.
 *
 * This is the confirmation step. The person recording a provision is not
 * checking that their typing was saved — they are checking that the structure
 * they entered means what the manual says. Those are different questions, and
 * only the second one matters downstream.
 *
 * Running the real classifier rather than describing the rules is deliberate:
 * a summary of what the rules "should" do could agree with the manual while the
 * classifier disagrees, which is the failure this screen exists to prevent.
 */
const CLASS_LABEL: Record<string, string> = {
  PRECEDENCE_RESOLVABLE: "Resolvable",
  PRECEDENCE_AMBIGUOUS: "Ambiguous",
  PRECEDENCE_INCORPORATED: "Incorporated by reference",
  REQUIRES_CLARIFICATION: "Needs clarification",
  NO_PRECEDENCE_PROVISION: "Not covered",
};

const CLASS_TONE: Record<string, string> = {
  PRECEDENCE_RESOLVABLE: "bg-emerald-100 text-emerald-900",
  PRECEDENCE_AMBIGUOUS: "bg-amber-100 text-amber-900",
  PRECEDENCE_INCORPORATED: "bg-sky-100 text-sky-900",
  REQUIRES_CLARIFICATION: "bg-neutral-200 text-neutral-800",
  NO_PRECEDENCE_PROVISION: "bg-neutral-200 text-neutral-700",
};

const spec = (over: Partial<ConflictLocus> = {}): ConflictLocus => ({
  documentType: "Specifications",
  ...over,
});

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
      label: "A specification against a drawing (E1)",
      conflictClass: "E1",
      between: [spec(), { documentType: "Drawings" }],
      why: "The most common conflict on a job, and the one a precedence clause is usually read for.",
    },
    {
      label: "A detail sheet against a plan sheet (E2)",
      conflictClass: "E2",
      between: [
        { documentType: "Large-scale detail drawings", reference: "detail" },
        { documentType: "Small-scale drawings", reference: "plan" },
      ],
      why: "Only a clause that ranks drawing types can settle this.",
    },
  ];

  // If the provision names an override, show it: the whole point of an override
  // is that it beats something the sequence ranks first.
  const override = provision.rules.find((r) => r.type === "OVERRIDE");
  const sequence = provision.rules.find((r) => r.type === "RANK_SEQUENCE");
  if (override && override.type === "OVERRIDE" && sequence && sequence.type === "RANK_SEQUENCE") {
    const topOfSequence = sequence.order[0]?.[0];
    if (topOfSequence) {
      cases.push({
        label: `${override.applies_to} against ${topOfSequence}`,
        conflictClass: "E1",
        between: [{ documentType: override.applies_to }, { documentType: topOfSequence }],
        why: `${topOfSequence} is first in the sequence, so this shows whether the override really fires before it.`,
      });
    }
  }

  if (provision.scope === "DIVISION_SCOPED" && provision.scope_target) {
    cases.push({
      label: `A conflict outside Division ${provision.scope_target}`,
      conflictClass: "E1",
      between: [spec({ division: "08" }), { documentType: "Drawings" }],
      why: "A section-scoped rule must not be applied to work it does not govern.",
    });
  }

  return cases;
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
          const result = classifyConflict({ conflict_class: c.conflictClass, between: c.between }, [provision]);
          return (
            <li key={c.label} className="rounded border border-neutral-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px]">{c.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    CLASS_TONE[result.class],
                  )}
                >
                  {CLASS_LABEL[result.class] ?? result.class}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-neutral-700">{result.explanation}</p>
              <p className="mt-0.5 text-[11px] text-neutral-400">{c.why}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
