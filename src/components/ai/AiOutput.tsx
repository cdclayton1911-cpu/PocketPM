"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";

import { MarkdownView } from "@/components/ai/MarkdownView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The output half of an AI module: idle, running, failed, or a result.
 *
 * The result is rendered as Markdown (see MarkdownView for the safety notes —
 * this text can echo contract language the user pasted). The Copy button
 * deliberately copies the raw Markdown, not the rendered text: it usually goes
 * into a document that understands it.
 */
export function AiOutput({
  title,
  text,
  isPending,
  error,
  idleHint,
  usage,
  footer,
}: {
  title: string;
  text?: string;
  isPending: boolean;
  error?: Error | null;
  idleHint: string;
  usage?: { input_tokens: number; output_tokens: number };
  footer?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is permission-gated; the text is selectable either way.
    }
  }

  return (
    <Card className="rounded-r12">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {text ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Sparkles className="size-3.5 animate-pulse" aria-hidden />
              Generating — short drafts take around 20 seconds, long documents over a minute.
            </p>
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[92, 78, 85, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded-r4 bg-secondary" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <p
            role="alert"
            className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger"
          >
            {error.message}
          </p>
        ) : text ? (
          <>
            <div className="max-h-[60vh] overflow-y-auto">
              <MarkdownView>{text}</MarkdownView>
            </div>
            <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
              A draft for review, not a decision — check every figure and reference against the
              contract documents before acting on it.
              {usage ? ` · ${usage.output_tokens.toLocaleString()} tokens generated.` : ""}
            </p>
            {footer}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">{idleHint}</p>
        )}
      </CardContent>
    </Card>
  );
}
