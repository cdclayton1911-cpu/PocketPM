"use client";

import { useState } from "react";

import { AiOutput } from "@/components/ai/AiOutput";
import { AiWorkbench } from "@/components/ai/AiWorkbench";
import { CheckboxList } from "@/components/ai/CheckboxList";
import { Field, NativeSelect } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAiTask, useSaveAiSession } from "@/hooks/useAiTask";
import type { Project } from "@/types";

const PROJECT_TYPES = [
  "Commercial — Healthcare",
  "Commercial — Office",
  "K-12 Education",
  "Industrial / Manufacturing",
  "Multi-Family Residential",
] as const;

const DIVISIONS = [
  "Div 02 Existing Conditions",
  "Div 03 Concrete",
  "Div 04 Masonry",
  "Div 05 Metals",
  "Div 06 Wood & Plastics",
  "Div 07 Thermal & Moisture",
  "Div 08 Openings",
  "Div 09 Finishes",
  "Div 21 Fire Suppression",
  "Div 22 Plumbing",
  "Div 23 HVAC",
  "Div 26 Electrical",
  "Div 31 Earthwork",
  "Div 32 Exterior Improvements",
] as const;

/**
 * Conceptual estimating.
 *
 * The prototype promised "RS Means benchmarks applied by location". There is no
 * RS Means data in this system and no licence for it, so that promise is not
 * repeated here: this produces an order-of-magnitude breakdown with its
 * assumptions stated, and says what it would need to price properly. Presenting
 * model-generated numbers as cost-database output would be the most expensive
 * kind of wrong this app could be.
 */
export function EstimatingClient({ project }: { project: Project }) {
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [squareFeet, setSquareFeet] = useState("");
  const [location, setLocation] = useState(
    [project.city, project.state].filter(Boolean).join(", "),
  );
  const [scope, setScope] = useState("");
  const [divisions, setDivisions] = useState<string[]>([]);

  const estimate = useAiTask("estimate");
  const save = useSaveAiSession("estimate");

  function run() {
    const description = [
      `Project type: ${projectType}`,
      divisions.length ? `Divisions to include: ${divisions.join(", ")}` : null,
      scope.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    estimate.mutate(
      {
        scope: description,
        ...(squareFeet ? { square_feet: Number(squareFeet) } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
      },
      {
        onSuccess: (r) =>
          save.mutate({
            title: `Estimate — ${projectType}${squareFeet ? ` · ${Number(squareFeet).toLocaleString()} sf` : ""}`,
            messages: JSON.stringify([
              { role: "user", content: description },
              { role: "assistant", content: r.text },
            ]),
            tokens_used: r.usage.input_tokens + r.usage.output_tokens,
          }),
      },
    );
  }

  return (
    <AiWorkbench
      intro="Order-of-magnitude estimating from a scope description. This is not a bid and is not priced from a cost database — it breaks the scope down, states its assumptions, and lists what it would need to price properly."
      formTitle="Scope input"
      form={
        <>
          <Field id="ptype" label="Project type">
            <NativeSelect
              id="ptype"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              options={PROJECT_TYPES}
              humanize={false}
              disabled={estimate.isPending}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="sf" label="Project size (SF)">
              <Input
                id="sf"
                type="number"
                min={1}
                value={squareFeet}
                onChange={(e) => setSquareFeet(e.target.value)}
                disabled={estimate.isPending}
              />
            </Field>
            <Field id="loc" label="Location (city, state)">
              <Input
                id="loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Charlotte, NC"
                disabled={estimate.isPending}
              />
            </Field>
          </div>

          <Field id="scope" label="Scope description">
            <Textarea
              id="scope"
              rows={7}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Structure, envelope, interiors, MEP, sitework. The more specific the quantities, the less it has to assume."
              disabled={estimate.isPending}
            />
          </Field>

          <CheckboxList
            legend="CSI divisions to include"
            options={DIVISIONS}
            selected={divisions}
            onChange={setDivisions}
            disabled={estimate.isPending}
          />

          <Button onClick={run} disabled={estimate.isPending || !scope.trim()}>
            {estimate.isPending ? "Estimating…" : "Generate estimate"}
          </Button>
        </>
      }
      output={
        <AiOutput
          title="Conceptual estimate"
          text={estimate.data?.text}
          usage={estimate.data?.usage}
          isPending={estimate.isPending}
          error={estimate.error}
          idleHint="Describe the scope and generate. Expect a division-by-division breakdown with every assumption stated — and a list of the quantities it could not assume."
        />
      }
    />
  );
}
