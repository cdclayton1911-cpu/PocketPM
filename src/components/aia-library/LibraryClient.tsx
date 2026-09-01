"use client";

import Link from "next/link";
import { useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import { AIA_DOCUMENT_GROUPS, type AiaDocument } from "@/lib/aia-documents";

/**
 * The AIA document library.
 *
 * The prototype's version offered "an AI-powered summary of key contractor
 * obligations" per document. That is narrowed here on purpose: a recital of a
 * standard form from memory is exactly where article numbers get invented, and
 * the executed contract is usually amended anyway. So the briefing explains what
 * the form is for and what to check in the signed copy, and points at the Clause
 * Risk Scanner for a reading on actual language.
 */
export function LibraryClient() {
  const [selected, setSelected] = useState<AiaDocument | null>(null);
  const brief = useAiTask("aia-brief");
  const save = useSaveAiSession("aia-brief");

  function open(document: AiaDocument) {
    setSelected(document);
    brief.mutate(
      { document_code: document.code, document_title: document.title },
      {
        onSuccess: (r) =>
          save.mutate({
            title: `${document.code} — ${document.title}`,
            messages: JSON.stringify([
              { role: "user", content: `${document.code} ${document.title}` },
              { role: "assistant", content: r.text },
            ]),
            tokens_used: r.usage.input_tokens + r.usage.output_tokens,
          }),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        The AIA forms behind a typical contract structure. Open one for a briefing on what it does
        and what to verify in your executed copy.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {AIA_DOCUMENT_GROUPS.map((group) => (
            <Card key={group.label} className="rounded-r12">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {group.documents.map((document) => (
                  <div
                    key={document.code}
                    className="flex items-start gap-3 rounded-r6 px-1 py-1.5 hover:bg-secondary"
                  >
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold">
                      {document.code}
                    </span>
                    <span className="flex-1 text-[13px]">
                      <span className="font-medium">{document.title}</span>
                      <span className="block text-muted-foreground">{document.summary}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-xs"
                      disabled={brief.isPending}
                      onClick={() => open(document)}
                    >
                      Brief
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <AiOutput
          title={selected ? `${selected.code} — ${selected.title}` : "Document briefing"}
          text={brief.data?.text}
          usage={brief.data?.usage}
          isPending={brief.isPending}
          error={brief.error}
          idleHint="Pick a document for a briefing on what it is for and what to check in the executed copy."
          footer={
            <p className="mt-2 text-[12px] text-muted-foreground">
              This briefing describes the standard form in general terms and cites no article
              numbers, because your copy has probably been amended.{" "}
              <Link href="/aia/scanner" className="font-medium text-primary hover:underline">
                Paste your actual clause into the scanner
              </Link>{" "}
              for a reading on the language you are bound by.
            </p>
          }
        />
      </div>
    </div>
  );
}
