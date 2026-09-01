"use client";

import Link from "next/link";
import { useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { AiWorkbench } from "@/components/ai/AiWorkbench";
import { Field } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import { parseTurns } from "@/lib/validation/ai-session";
import type { AiSession, Project } from "@/types";

/**
 * Contract risk register.
 *
 * Reads contract *language*; the register on the AIA dashboard reads *records*
 * (missed notices, unexecuted subcontracts, disputed pay apps). They are
 * deliberately different instruments and the page says so, because two things
 * called a risk register that disagree is worse than either alone.
 *
 * The prototype's version was ten hardcoded rows about a demo project, naming a
 * specific state anti-indemnity statute. None of that is reproduced: nothing
 * appears here that was not derived from language the user supplied.
 */
export function RegisterClient({
  project,
  history,
}: {
  project: Project;
  history: AiSession[];
}) {
  const [provisions, setProvisions] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const review = useAiTask("risk-register");
  const save = useSaveAiSession("risk-register");

  const past = history.filter((session) => session.module === "risk-register");
  const opened = past.find((session) => session.id === openId);
  const openedText = opened
    ? (parseTurns(opened.messages).find((turn) => turn.role === "assistant")?.content ?? "")
    : "";

  function run() {
    const text = provisions.trim();
    if (!text) return;
    setOpenId(null);
    review.mutate(
      {
        provisions: text,
        ...(project.contract_type ? { contract_type: project.contract_type } : {}),
      },
      {
        onSuccess: (r) =>
          save.mutate({
            title: `Risk register — ${new Date().toISOString().slice(0, 10)}`,
            messages: JSON.stringify([
              { role: "user", content: text },
              { role: "assistant", content: r.text },
            ]),
            tokens_used: r.usage.input_tokens + r.usage.output_tokens,
          }),
      },
    );
  }

  return (
    <AiWorkbench
      intro="Build a risk register from your contract's actual provisions. Paste the articles you want reviewed — the register is only as good as the language you give it."
      formTitle="Contract provisions"
      form={
        <>
          <Field id="provisions" label="Provisions to review">
            <Textarea
              id="provisions"
              rows={14}
              value={provisions}
              onChange={(event) => setProvisions(event.target.value)}
              placeholder="Paste the notice, changes, payment, indemnity, and termination provisions from the executed contract."
              disabled={review.isPending}
            />
          </Field>
          <Button onClick={run} disabled={review.isPending || !provisions.trim()}>
            {review.isPending ? "Reviewing…" : "Build risk register"}
          </Button>
          <p className="text-[12px] text-muted-foreground">
            Looking for risks in the project&apos;s <em>records</em> — missed notices, unexecuted
            subcontracts, disputed pay applications?{" "}
            <Link href="/aia/dashboard" className="font-medium text-primary hover:underline">
              That register is on the contract dashboard
            </Link>{" "}
            and is computed, not generated.
          </p>
        </>
      }
      belowForm={
        past.length > 0 ? (
          <Card className="rounded-r12">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Previous reviews</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {past.slice(0, 8).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setOpenId(session.id)}
                  className="rounded-r6 px-1 py-1 text-left text-[13px] hover:bg-secondary"
                >
                  <span className="font-medium">{session.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {session.created.slice(0, 16).replace("T", " ")}
                    {session.tokens_used ? ` · ${session.tokens_used.toLocaleString()} tokens` : ""}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        ) : null
      }
      output={
        <AiOutput
          title={opened ? opened.title : "Risk register"}
          text={review.data?.text ?? (openedText || undefined)}
          usage={opened ? undefined : review.data?.usage}
          isPending={review.isPending}
          error={review.error}
          idleHint="Paste your contract's provisions and build the register. Each row states the risk, how the language departs from the standard position, and what to do about it."
        />
      }
    />
  );
}
