"use client";

import { useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { AiWorkbench } from "@/components/ai/AiWorkbench";
import { CheckboxList } from "@/components/ai/CheckboxList";
import { Field } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import type { Project } from "@/types";

/**
 * The activities the plan generator covers, each with the subpart the prototype
 * paired it with. The subpart travels in the label so the model is given it
 * rather than asked to recall it — the prompt forbids inventing citations.
 */
const ACTIVITIES = [
  "Fall protection — work at height above 6 ft (29 CFR 1926 Subpart M)",
  "Aerial lifts / scaffolding (29 CFR 1926 Subpart L)",
  "Excavation and trenching (29 CFR 1926 Subpart P)",
  "Steel erection (29 CFR 1926 Subpart R)",
  "Concrete and masonry (29 CFR 1926 Subpart Q)",
  "Confined space entry (29 CFR 1910.146)",
  "Hazardous energy — lockout/tagout (29 CFR 1910.147)",
  "Silica exposure — grinding/cutting concrete (29 CFR 1926.1153)",
] as const;

type Mode = "plan" | "aha" | "talk";

const MODES: { value: Mode; label: string; button: string }[] = [
  { value: "plan", label: "Site safety plan", button: "Generate safety plan" },
  { value: "aha", label: "Activity hazard analysis", button: "Generate AHA" },
  { value: "talk", label: "Toolbox talk", button: "Write toolbox talk" },
];

/**
 * Three related generators on one page rather than three nav entries: they
 * share the same inputs and the same audience, and the prototype's separate
 * toolbox-talk control lived here too.
 */
export function SafetyPlansClient({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>("plan");
  const [activities, setActivities] = useState<string[]>([ACTIVITIES[0]]);
  const [squareFeet, setSquareFeet] = useState("");
  const [workforce, setWorkforce] = useState("");
  const [activity, setActivity] = useState("");
  const [topic, setTopic] = useState("");

  const plan = useAiTask("safety-plan");
  const aha = useAiTask("safety-analysis");
  const talk = useAiTask("toolbox-talk");
  const savePlan = useSaveAiSession("safety-plan");
  const saveAha = useSaveAiSession("safety-analysis");
  const saveTalk = useSaveAiSession("toolbox-talk");

  const active = mode === "plan" ? plan : mode === "aha" ? aha : talk;
  const spec = MODES.find((m) => m.value === mode)!;

  const canRun =
    mode === "plan" ? activities.length > 0 : mode === "aha" ? activity.trim() : topic.trim();

  function run() {
    if (mode === "plan") {
      plan.mutate(
        {
          project_name: project.name,
          activities,
          // Empty inputs must stay absent, not become 0.
          ...(squareFeet ? { square_feet: Number(squareFeet) } : {}),
          ...(workforce ? { peak_workforce: Number(workforce) } : {}),
        },
        {
          onSuccess: (r) =>
            savePlan.mutate({
              title: `Site safety plan — ${project.name}`,
              messages: JSON.stringify([
                { role: "user", content: activities.join("\n") },
                { role: "assistant", content: r.text },
              ]),
              tokens_used: r.usage.input_tokens + r.usage.output_tokens,
            }),
        },
      );
    } else if (mode === "aha") {
      aha.mutate(
        { activity: activity.trim() },
        {
          onSuccess: (r) =>
            saveAha.mutate({
              title: `AHA — ${activity.trim().slice(0, 80)}`,
              messages: JSON.stringify([
                { role: "user", content: activity.trim() },
                { role: "assistant", content: r.text },
              ]),
              tokens_used: r.usage.input_tokens + r.usage.output_tokens,
            }),
        },
      );
    } else {
      talk.mutate(
        { topic: topic.trim() },
        {
          onSuccess: (r) =>
            saveTalk.mutate({
              title: `Toolbox talk — ${topic.trim().slice(0, 80)}`,
              messages: JSON.stringify([
                { role: "user", content: topic.trim() },
                { role: "assistant", content: r.text },
              ]),
              tokens_used: r.usage.input_tokens + r.usage.output_tokens,
            }),
        },
      );
    }
  }

  return (
    <AiWorkbench
      intro="Written safety documents built from this project's scope. Every citation must be checked against the current standard before the document is issued."
      formTitle={spec.label}
      form={
        <>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <Button
                key={m.value}
                size="sm"
                variant={mode === m.value ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {mode === "plan" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field id="sf" label="Project size (SF)">
                  <Input
                    id="sf"
                    type="number"
                    min={1}
                    value={squareFeet}
                    onChange={(e) => setSquareFeet(e.target.value)}
                    disabled={plan.isPending}
                  />
                </Field>
                <Field id="workforce" label="Peak workforce">
                  <Input
                    id="workforce"
                    type="number"
                    min={1}
                    value={workforce}
                    onChange={(e) => setWorkforce(e.target.value)}
                    disabled={plan.isPending}
                  />
                </Field>
              </div>
              <CheckboxList
                legend="High-risk activities on this project"
                options={ACTIVITIES}
                selected={activities}
                onChange={setActivities}
                disabled={plan.isPending}
              />
            </>
          ) : mode === "aha" ? (
            <Field id="activity" label="Activity to analyse">
              <Textarea
                id="activity"
                rows={5}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="Describe the task step by step — who does what, with what equipment, at what height."
                disabled={aha.isPending}
              />
            </Field>
          ) : (
            <Field id="topic" label="Talk topic">
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ladder setup and three points of contact"
                disabled={talk.isPending}
              />
            </Field>
          )}

          <Button onClick={run} disabled={active.isPending || !canRun}>
            {active.isPending ? "Generating…" : spec.button}
          </Button>
        </>
      }
      output={
        <AiOutput
          title={spec.label}
          text={active.data?.text}
          usage={active.data?.usage}
          isPending={active.isPending}
          error={active.error}
          idleHint="Pick what you need and generate. The output is a starting draft — a competent person must review it against the actual site before it is posted or trained to."
        />
      }
    />
  );
}
