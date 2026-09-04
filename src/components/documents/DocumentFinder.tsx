"use client";

import { Download, FileText, Search, Sparkles } from "lucide-react";
import { useState } from "react";

import { MarkdownView } from "@/components/ai/MarkdownView";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field, NativeSelect } from "@/components/shared/FormField";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAskDocuments,
  useDocumentSearch,
  type DocumentFilters,
} from "@/hooks/useDocumentSearch";
import { DOCUMENT_REVISION_STATUS, type DocumentRevisionStatus } from "@/types";

const TONE: Record<DocumentRevisionStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  superseded: "neutral",
};

const PARENT_OPTIONS = ["", "submittal", "rfi"] as const;
const PARENT_LABELS: Record<string, string> = {
  "": "All documents",
  submittal: "Submittals",
  rfi: "RFIs",
};
const STATUS_LABELS: Record<string, string> = { "": "Any status" };

/**
 * Find documents across the project's submittal and RFI revision history.
 *
 * This is stage 1 of retrieval with a face on it — metadata selection, no
 * semantic search. Its second job is to generate the usage data that decides
 * whether semantic search is ever needed: every filter change logs a
 * server-side selectivity line. See docs/rag-plan.md.
 */
export function DocumentFinder({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<DocumentFilters>({ current_only: true });
  const [question, setQuestion] = useState("");

  const search = useDocumentSearch(projectId, filters);
  const ask = useAskDocuments();

  const items = search.data?.items ?? [];
  const set = <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-3">
      <Card className="rounded-r12">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Find documents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="ptype" label="Type">
            <NativeSelect
              id="ptype"
              value={filters.parent_type ?? ""}
              onChange={(e) =>
                set("parent_type", (e.target.value || undefined) as DocumentFilters["parent_type"])
              }
              options={PARENT_OPTIONS}
              labels={PARENT_LABELS}
            />
          </Field>
          <Field id="status" label="Status">
            <NativeSelect
              id="status"
              value={filters.status ?? ""}
              onChange={(e) => set("status", e.target.value || undefined)}
              options={["", ...DOCUMENT_REVISION_STATUS]}
              labels={STATUS_LABELS}
            />
          </Field>
          <Field id="spec" label="Spec section">
            <Input
              id="spec"
              placeholder="05 12 00"
              value={filters.spec_section ?? ""}
              onChange={(e) => set("spec_section", e.target.value)}
            />
          </Field>
          <Field id="drawing" label="Drawing (RFIs)">
            <Input
              id="drawing"
              placeholder="S-201"
              value={filters.drawing ?? ""}
              onChange={(e) => set("drawing", e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={filters.current_only ?? false}
                onChange={(e) => set("current_only", e.target.checked)}
              />
              Current revision only
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={filters.with_file_only ?? false}
                onChange={(e) => set("with_file_only", e.target.checked)}
              />
              Has a file attached
            </label>
            <span className="ml-auto text-[13px] text-muted-foreground">
              {search.isLoading
                ? "Searching…"
                : `${search.data?.selected ?? 0} of ${search.data?.total ?? 0} revisions`}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-r12">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Results</CardTitle>
        </CardHeader>
        <CardContent>
          {search.isError ? (
            <p
              role="alert"
              className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger"
            >
              {search.error instanceof Error ? search.error.message : "Search failed."}
            </p>
          ) : items.length === 0 && !search.isLoading ? (
            <EmptyState
              icon={Search}
              title="Nothing matches those filters"
              description="Revisions appear here once a submittal or RFI has one. Clear a filter to widen the search."
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-r6 border px-3 py-2 text-[13px]"
                >
                  <span className="font-mono text-xs">Rev {r.revision_number}</span>
                  <StatusBadge tone={TONE[r.status as DocumentRevisionStatus] ?? "neutral"}>
                    {r.status}
                  </StatusBadge>
                  {r.is_current ? <StatusBadge tone="success">Current</StatusBadge> : null}
                  <span className="min-w-0 flex-1 truncate">{r.parent_label}</span>
                  {r.spec_section ? (
                    <span className="font-mono text-xs text-muted-foreground">{r.spec_section}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {r.issued_at || "not issued"}
                  </span>
                  {r.file ? (
                    <a
                      href={`/api/files/document_revisions/${r.id}/${encodeURIComponent(r.file)}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download className="size-3.5" aria-hidden /> PDF
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <FileText className="size-3.5" aria-hidden /> no file
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-r12">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Ask about status and chronology
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-[12px] text-muted-foreground">
            Answers come from the revision list above — numbers, statuses, and dates.{" "}
            <strong className="font-semibold">Document contents are not read.</strong> Ask what is
            current or what was superseded and when; to know what a drawing says, open it.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Which submittals are still not issued?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim() && !ask.isPending) {
                  ask.mutate({ question: question.trim(), filters });
                }
              }}
              disabled={ask.isPending}
            />
            <Button
              onClick={() => ask.mutate({ question: question.trim(), filters })}
              disabled={ask.isPending || !question.trim()}
            >
              <Sparkles className="size-3.5" aria-hidden />
              {ask.isPending ? "Asking…" : "Ask"}
            </Button>
          </div>

          {ask.data ? (
            <div className="rounded-r8 border bg-secondary/30 p-3">
              <MarkdownView>{ask.data.answer}</MarkdownView>
              <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                Based on {ask.data.selected} revision{ask.data.selected === 1 ? "" : "s"} of{" "}
                {ask.data.total}. Metadata only — no document was read.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
