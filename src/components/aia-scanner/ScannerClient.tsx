"use client";

import { useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { AiWorkbench } from "@/components/ai/AiWorkbench";
import { Field, NativeSelect } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";

const DOC_TYPES = [
  "AIA A101 — Owner-Contractor",
  "AIA A201 — General Conditions",
  "AIA A401 — Subcontract",
  "Custom / Non-AIA Contract",
  "Public Agency Contract",
] as const;

const FOCUS_AREAS = [
  "Full risk review",
  "Claims & notices",
  "Payment & retainage",
  "Changes & delays",
  "Termination rights",
  "Indemnification",
  "Warranty",
  "Dispute resolution",
] as const;

/**
 * Clause text to try the scanner on.
 *
 * The prototype shipped these as "sample high-risk clauses". They are kept
 * because they are genuinely useful for seeing what the tool does before
 * pasting a real contract into it — but they are labelled as illustrations, not
 * as anything drawn from this project.
 */
const SAMPLES: { label: string; text: string }[] = [
  {
    label: "Shortened claim notice",
    text: "Contractor waives all claims for additional compensation or time unless submitted in writing within 5 days of the event giving rise to the claim.",
  },
  {
    label: "Pay-if-paid",
    text: "Receipt of payment by Contractor from Owner for Subcontractor's Work is an express condition precedent to Contractor's obligation to pay Subcontractor, and Subcontractor assumes the risk of Owner's non-payment.",
  },
  {
    label: "Broad-form indemnity",
    text: "Subcontractor shall indemnify, defend and hold harmless Contractor and Owner from any and all claims arising out of or in any way connected with the Work, regardless of whether caused in part by a party indemnified hereunder.",
  },
  {
    label: "No-damages-for-delay",
    text: "Contractor's sole remedy for any delay, hindrance, or interference, from any cause whatsoever, shall be an extension of the Contract Time; no monetary compensation shall be due.",
  },
];

export function ScannerClient() {
  const [clause, setClause] = useState("");
  const [docType, setDocType] = useState<string>(DOC_TYPES[1]);
  const [focus, setFocus] = useState<string>(FOCUS_AREAS[0]);

  const review = useAiTask("contract-review");
  const save = useSaveAiSession("contract-review");

  function run() {
    const clause_text = clause.trim();
    if (!clause_text) return;
    review.mutate(
      {
        clause_text,
        document_type: docType,
        // "Full risk review" is the default the prompt already assumes.
        ...(focus === FOCUS_AREAS[0] ? {} : { focus }),
      },
      {
        onSuccess: (result) => {
          save.mutate({
            title: `${docType} — ${focus}`,
            messages: JSON.stringify([
              { role: "user", content: clause_text },
              { role: "assistant", content: result.text },
            ]),
            tokens_used: result.usage.input_tokens + result.usage.output_tokens,
          });
        },
      },
    );
  }

  return (
    <AiWorkbench
      intro="Paste a contract clause for a risk reading against standard AIA positions. Works on AIA documents, owner-drafted contracts, and subcontracts."
      formTitle="Contract clause"
      form={
        <>
          <Field id="clause" label="Clause text">
            <Textarea
              id="clause"
              rows={9}
              value={clause}
              onChange={(event) => setClause(event.target.value)}
              placeholder="Paste the clause exactly as written in the contract."
              disabled={review.isPending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="doc_type" label="Document type">
              <NativeSelect
                id="doc_type"
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
                options={DOC_TYPES}
                humanize={false}
                disabled={review.isPending}
              />
            </Field>
            <Field id="focus" label="Focus area">
              <NativeSelect
                id="focus"
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                options={FOCUS_AREAS}
                humanize={false}
                disabled={review.isPending}
              />
            </Field>
          </div>

          <Button onClick={run} disabled={review.isPending || !clause.trim()}>
            {review.isPending ? "Scanning…" : "Scan clause"}
          </Button>
        </>
      }
      belowForm={
        <Card className="rounded-r12">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Try it on a known-bad clause</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-[12px] text-muted-foreground">
              Illustrations of language that commonly shifts risk onto the contractor. These are
              examples, not clauses from this project&apos;s contract.
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((sample) => (
                <Button
                  key={sample.label}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={review.isPending}
                  onClick={() => setClause(sample.text)}
                >
                  {sample.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      }
      output={
        <AiOutput
          title="Risk analysis"
          text={review.data?.text}
          usage={review.data?.usage}
          isPending={review.isPending}
          error={review.error}
          idleHint="Paste a clause and scan it. The reading covers what the language does, how it departs from the standard position, and what to ask for instead."
        />
      }
    />
  );
}
