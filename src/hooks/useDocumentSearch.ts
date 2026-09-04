"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { FieldErrors } from "@/lib/validation/auth";

/** Filters the finder can set. Mirrors the API's allow-list. */
export interface DocumentFilters {
  parent_type?: "submittal" | "rfi";
  status?: string;
  current_only?: boolean;
  with_file_only?: boolean;
  spec_section?: string;
  drawing?: string;
}

export interface FoundRevision {
  id: string;
  revision_number: number;
  status: string;
  is_current: boolean;
  issued_at: string;
  file: string;
  parent_type: "submittal" | "rfi" | "unknown";
  parent_id: string;
  parent_label: string;
  spec_section: string;
}

interface SearchResponse {
  items: FoundRevision[];
  selected: number;
  total: number;
  filters_used: string[];
  within_stage_two_limit: boolean;
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
  return data.errors?.form ?? Object.values(data.errors ?? {})[0] ?? "Something went wrong";
}

function toParams(filters: DocumentFilters): string {
  const p = new URLSearchParams();
  if (filters.parent_type) p.set("parent_type", filters.parent_type);
  if (filters.status) p.set("status", filters.status);
  if (filters.current_only) p.set("current_only", "true");
  if (filters.with_file_only) p.set("with_file_only", "true");
  if (filters.spec_section?.trim()) p.set("spec_section", filters.spec_section.trim());
  if (filters.drawing?.trim()) p.set("drawing", filters.drawing.trim());
  return p.toString();
}

export function useDocumentSearch(projectId: string, filters: DocumentFilters) {
  const params = toParams(filters);
  return useQuery({
    // The params are in the key, so every distinct filter set is its own cache
    // entry — and every one of them logs a stage-1 line server-side.
    queryKey: ["retrieval", projectId, params],
    queryFn: async (): Promise<SearchResponse> => {
      const res = await fetch(`/api/retrieval/revisions?${params}`);
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as SearchResponse;
    },
    enabled: Boolean(projectId),
  });
}

export interface AskResponse {
  answer: string;
  selected: number;
  total: number;
  spent_ai_call: boolean;
}

/** Ask a status/chronology question about the current selection. */
export function useAskDocuments() {
  return useMutation({
    mutationFn: async (input: {
      question: string;
      filters: DocumentFilters;
    }): Promise<AskResponse> => {
      const res = await fetch("/api/retrieval/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as AskResponse;
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not answer that"),
  });
}
