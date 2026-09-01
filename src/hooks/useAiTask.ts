"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { AiTaskName } from "@/lib/ai/tasks";
import type { FieldErrors } from "@/lib/validation/auth";

/**
 * Run one AI task.
 *
 * Thin on purpose: the modules differ in their inputs and in what they do with
 * the text, not in how they call the endpoint.
 *
 * Errors surface as a toast AND as returned state, because these responses are
 * the point of the page — a toast that scrolls away is not enough to explain
 * why the output panel is empty.
 */

export interface AiResponse {
  task: AiTaskName;
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: FieldErrors };
  return data.errors?.form ?? Object.values(data.errors ?? {})[0] ?? "The request failed";
}

export function useAiTask(task: AiTaskName) {
  return useMutation({
    mutationFn: async (input: Record<string, unknown>): Promise<AiResponse> => {
      const res = await fetch(`/api/ai/${task}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) {
        // 429 is the one a user can act on, so it says how long to wait.
        if (res.status === 429) {
          const retry = Number(res.headers.get("Retry-After"));
          const message = await readError(res);
          throw new Error(
            Number.isFinite(retry) && retry > 0
              ? `${message} (about ${Math.ceil(retry / 60)} min)`
              : message,
          );
        }
        throw new Error(await readError(res));
      }
      return (await res.json()) as AiResponse;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The request failed");
    },
  });
}

/** Persist a generation to ai_sessions so it survives a reload. */
export function useSaveAiSession(module: AiTaskName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; messages: string; tokens_used?: number }) => {
      const res = await fetch("/api/ai-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, module }),
      });
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai_sessions"] });
    },
    onError: (error) => {
      // Non-fatal: the generation is on screen, only the saved copy is lost.
      toast.error(
        `Generated, but could not save to history: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    },
  });
}
