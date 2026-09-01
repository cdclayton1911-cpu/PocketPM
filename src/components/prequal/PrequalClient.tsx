"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { AiWorkbench } from "@/components/ai/AiWorkbench";
import { CheckboxList } from "@/components/ai/CheckboxList";
import { Field, NativeSelect } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import { formatBondCapacity, formatQualityScore } from "@/lib/registry-format";
import type { Subcontractor } from "@/types";

const AGENCY_TYPES = [
  "Commercial — Healthcare",
  "K-12 Education",
  "Industrial",
  "Federal / Public Agency",
] as const;

const PACKAGE_ITEMS = [
  "Financial statements (3-yr audited)",
  "Insurance certificates",
  "Surety bond capacity letter",
  "EMR history (3-yr)",
  "Similar project experience (5 projects)",
  "Key personnel resumes",
  "MBE/WBE certifications",
  "CQM-C certification docs",
] as const;

/**
 * Assemble the facts the assessment is given, from the subcontractor's own
 * record.
 *
 * Every line is a stored value or an explicit "not recorded". The prompt is
 * told what is missing rather than left to guess, because "no EMR on file" and
 * "an EMR of 0" are very different findings and the collection cannot tell them
 * apart (PocketBase returns 0 for an unset number).
 */
function describe(sub: Subcontractor, onFile: string[]): string {
  return [
    `Trade: ${sub.trade || "not recorded"}`,
    `Licence: ${sub.license_number ? `on file (${sub.license_number})` : "not recorded"}`,
    `Insurance expiry: ${sub.insurance_expiry || "not recorded"}`,
    `Bond capacity: ${sub.bond_capacity ? formatBondCapacity(sub.bond_capacity) : "not recorded"}`,
    `EMR: ${sub.emr ? sub.emr : "not recorded"}`,
    `Internal quality score: ${formatQualityScore(sub.quality_score)}`,
    `Registry status: ${sub.status}`,
    `A401 status: ${sub.a401_status || "not recorded"}`,
    "",
    onFile.length
      ? `Package documents received:\n${onFile.map((i) => `- ${i}`).join("\n")}`
      : "No package documents have been received.",
    "",
    `Documents NOT received: ${
      PACKAGE_ITEMS.filter((i) => !onFile.includes(i)).join("; ") || "none — package is complete"
    }`,
  ].join("\n");
}

export function PrequalClient({ subcontractors }: { subcontractors: Subcontractor[] }) {
  const active = useMemo(
    () => subcontractors.filter((s) => s.status !== "inactive"),
    [subcontractors],
  );

  const [subId, setSubId] = useState(active[0]?.id ?? "");
  const [owner, setOwner] = useState("");
  const [agencyType, setAgencyType] = useState<string>(AGENCY_TYPES[0]);
  const [award, setAward] = useState("");
  const [onFile, setOnFile] = useState<string[]>([]);

  const assess = useAiTask("prequalification");
  const save = useSaveAiSession("prequalification");
  const selected = active.find((s) => s.id === subId);

  function run() {
    if (!selected) return;
    const details = [
      owner.trim() ? `Owner / agency: ${owner.trim()}` : null,
      `Project type: ${agencyType}`,
      "",
      describe(selected, onFile),
    ]
      .filter(Boolean)
      .join("\n");

    assess.mutate(
      {
        company_name: selected.company_name,
        details,
        ...(award ? { proposed_award: Number(award) } : {}),
      },
      {
        onSuccess: (r) =>
          save.mutate({
            title: `Prequal — ${selected.company_name}`,
            messages: JSON.stringify([
              { role: "user", content: details },
              { role: "assistant", content: r.text },
            ]),
            tokens_used: r.usage.input_tokens + r.usage.output_tokens,
          }),
      },
    );
  }

  if (active.length === 0) {
    return (
      <div className="rounded-r12 border bg-card p-6 text-center">
        <p className="text-sm font-medium">No subcontractors in the registry</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
          This assessment reads a subcontractor&apos;s own record — licence, bonding, EMR,
          insurance — rather than asking you to retype it. Add one first.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/registry">Open the registry</Link>
        </Button>
      </div>
    );
  }

  return (
    <AiWorkbench
      intro="Assess a subcontractor's prequalification package against the award you are considering. The facts come from their registry record, so the assessment cannot be based on figures nobody entered."
      formTitle="Prequalification package"
      form={
        <>
          <Field id="sub" label="Subcontractor">
            {/* Not NativeSelect: that renders each option's value as its own
                label, which here would show record ids to the user. */}
            <select
              id="sub"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              disabled={assess.isPending}
              className="h-9 w-full rounded-r6 border border-input bg-card px-2 text-sm text-foreground disabled:opacity-50"
            >
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company_name}
                  {s.trade ? ` — ${s.trade}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="owner" label="Owner / agency">
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                disabled={assess.isPending}
              />
            </Field>
            <Field id="award" label="Proposed award ($)">
              <Input
                id="award"
                type="number"
                min={0}
                value={award}
                onChange={(e) => setAward(e.target.value)}
                disabled={assess.isPending}
              />
            </Field>
          </div>

          <Field id="atype" label="Project type">
            <NativeSelect
              id="atype"
              value={agencyType}
              onChange={(e) => setAgencyType(e.target.value)}
              options={AGENCY_TYPES}
              humanize={false}
              disabled={assess.isPending}
            />
          </Field>

          <CheckboxList
            legend="Package documents received"
            options={PACKAGE_ITEMS}
            selected={onFile}
            onChange={setOnFile}
            disabled={assess.isPending}
          />

          <Button onClick={run} disabled={assess.isPending || !selected}>
            {assess.isPending ? "Assessing…" : "Assess package"}
          </Button>
        </>
      }
      output={
        <AiOutput
          title="Package assessment"
          text={assess.data?.text}
          usage={assess.data?.usage}
          isPending={assess.isPending}
          error={assess.error}
          idleHint="Pick a subcontractor and assess. The reading covers bonding against the award, EMR, insurance currency, and licence status — and says plainly what is missing."
        />
      }
    />
  );
}
