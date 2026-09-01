import { z } from "zod";

import { AI_TASK_NAMES } from "@/lib/ai/tasks";

/**
 * A saved AI generation.
 *
 * `messages` is a JSON string because the collection field is text — the schema
 * has no JSON type. Validated as a string here and parsed at the edges.
 */
export const aiSessionSchema = z.object({
  /** Which module produced it, so a module can list only its own history. */
  module: z.enum(AI_TASK_NAMES),
  title: z.string().trim().min(1, "Title is required").max(200),
  messages: z.string().max(200_000),
  tokens_used: z.number().int().nonnegative().optional(),
});

export const aiSessionUpdateSchema = aiSessionSchema.partial();
export type AiSessionInput = z.infer<typeof aiSessionSchema>;

/** One turn of a saved conversation. */
export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
}

/** Parse the `messages` blob defensively — it is text, not a JSON column. */
export function parseTurns(raw: string): StoredTurn[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (turn): turn is StoredTurn =>
        typeof turn === "object" &&
        turn !== null &&
        (("role" in turn && (turn.role === "user" || turn.role === "assistant")) as boolean) &&
        "content" in turn &&
        typeof (turn as StoredTurn).content === "string",
    );
  } catch {
    return [];
  }
}
