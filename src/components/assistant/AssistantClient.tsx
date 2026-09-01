"use client";

import { Bot, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import type { StoredTurn } from "@/lib/validation/ai-session";
import type { Project } from "@/types";

/** Openers that need no project data to be useful. */
const STARTERS = [
  "What should I check before approving a pay application?",
  "Walk me through the notice steps for a differing site condition.",
  "What belongs in a preparatory meeting for a definable feature of work?",
  "How should I document a delay caused by late owner-furnished equipment?",
];

/**
 * PM assistant.
 *
 * The conversation is held in component state and resent with each turn — the
 * Messages API is stateless. It is saved to ai_sessions after each exchange so
 * a reload does not lose it, but the transcript on screen is the source of
 * truth for the request.
 *
 * History is capped by the task schema at 40 turns. Past that the oldest are
 * dropped rather than the request being rejected, which keeps a long
 * conversation working at the cost of the model forgetting its start — said on
 * screen rather than done silently.
 */
const MAX_TURNS = 40;

export function AssistantClient({ project }: { project: Project }) {
  const [turns, setTurns] = useState<StoredTurn[]>([]);
  const [draft, setDraft] = useState("");
  const chat = useAiTask("chat");
  const save = useSaveAiSession("chat");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, chat.isPending]);

  function send(message: string) {
    const text = message.trim();
    if (!text || chat.isPending) return;

    const history = turns.slice(-MAX_TURNS);
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");

    chat.mutate(
      { message: text, history },
      {
        onSuccess: (result) => {
          const next: StoredTurn[] = [
            ...history,
            { role: "user", content: text },
            { role: "assistant", content: result.text },
          ];
          setTurns((prev) => [...prev, { role: "assistant", content: result.text }]);
          save.mutate({
            title: text.slice(0, 80),
            messages: JSON.stringify(next),
            tokens_used: result.usage.input_tokens + result.usage.output_tokens,
          });
        },
        onError: () => {
          // Drop the optimistic user turn: leaving it makes the transcript
          // claim a question was asked and ignored.
          setTurns((prev) => prev.slice(0, -1));
          setDraft(text);
        },
      },
    );
  }

  const dropped = Math.max(0, turns.length - MAX_TURNS);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        Construction management questions, in the context of {project.name}. It knows the
        project&apos;s basics — not its records — so quote the numbers you want it to work from.
      </p>

      <Card className="rounded-r12">
        <CardContent className="flex h-[min(62vh,640px)] flex-col gap-3 overflow-y-auto p-4">
          {turns.length === 0 && !chat.isPending ? (
            <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
              <Bot className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Ask about anything on the job</p>
              <div className="flex flex-col gap-1.5">
                {STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal py-1.5 text-left text-xs"
                    onClick={() => send(starter)}
                  >
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {dropped > 0 ? (
            <p className="text-center text-[11px] text-muted-foreground">
              The first {dropped} {dropped === 1 ? "turn is" : "turns are"} no longer being sent —
              it will not remember the start of this conversation.
            </p>
          ) : null}

          {turns.map((turn, index) => (
            <div key={index} className="flex gap-2">
              <span
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary"
                aria-hidden
              >
                {turn.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {turn.role === "user" ? "You" : "Assistant"}
                </p>
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{turn.content}</div>
              </div>
            </div>
          ))}

          {chat.isPending ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
              <Bot className="size-3.5 animate-pulse" aria-hidden /> Thinking…
            </p>
          ) : null}

          {chat.isError ? (
            <p
              role="alert"
              className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger"
            >
              {chat.error.message} Your message has been put back in the box.
            </p>
          ) : null}

          <div ref={endRef} />
        </CardContent>
      </Card>

      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
          placeholder="Ask a question…"
          disabled={chat.isPending}
          className="flex-1"
        />
        <Button onClick={() => send(draft)} disabled={chat.isPending || !draft.trim()}>
          <Send className="size-3.5" aria-hidden /> Send
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Answers are drafts for review. Check anything contractual against the executed documents.
      </p>
    </div>
  );
}
