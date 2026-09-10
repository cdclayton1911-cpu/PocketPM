"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorsFromZod } from "@/lib/validation/auth";
import { precedenceProvisionSchema } from "@/lib/validation/precedence";
import { falsePositiveSignals } from "@/lib/precedence/false-positives";
import type {
  ConflictClass,
  PrecedenceProvision,
  PrecedenceRule,
  PrecedenceScope,
} from "@/lib/precedence/types";

const CONFLICT_CLASS_LABELS: [ConflictClass, string][] = [
  ["E1", "E1 spec vs drawing"],
  ["E2", "E2 drawing vs drawing"],
  ["E3", "E3 spec vs spec"],
  ["E4", "E4 specified, not shown"],
  ["E5", "E5 shown, not specified"],
];
import { ProvisionPreview } from "./ProvisionPreview";

interface StoredProvision {
  id: string;
  section: string;
  page: number | null;
  scope: PrecedenceScope;
  scope_target: string;
  rules: PrecedenceRule[];
  resolves: ConflictClass[];
  external_instrument_name: string;
  external_instrument_edition: string;
  source_text: string;
  notes: string;
}

const SCOPES: { value: PrecedenceScope; label: string; hint: string }[] = [
  { value: "PROJECT_WIDE", label: "Project-wide", hint: "In Division 01 or the General Conditions; governs all contract documents." },
  { value: "DIVISION_SCOPED", label: "One division or section", hint: "Inside a technical section; governs that work only." },
  { value: "EXTERNAL", label: "Incorporated by reference", hint: "Names a standard form that is not in this document set." },
];

const BLANK: Omit<StoredProvision, "id"> = {
  section: "", page: null, scope: "PROJECT_WIDE", scope_target: "", rules: [],
  resolves: [], external_instrument_name: "",
  external_instrument_edition: "", source_text: "", notes: "",
};

export function PrecedenceClient({ projectId, projectName }: { projectId: string; projectName: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Omit<StoredProvision, "id"> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);

  const query = useQuery<{ items: StoredProvision[] }>({
    queryKey: ["precedence-provisions", projectId],
    queryFn: async () => {
      const res = await fetch("/api/precedence-provisions");
      if (!res.ok) throw new Error("Could not load precedence provisions");
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(
        editingId ? `/api/precedence-provisions/${editingId}` : "/api/precedence-provisions",
        { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.form ?? "Could not save the provision");
      return data;
    },
    onSuccess: () => {
      setDraft(null); setEditingId(null); setConfirmed(false); setErrors({});
      void queryClient.invalidateQueries({ queryKey: ["precedence-provisions", projectId] });
      toast.success("Provision recorded.");
    },
    onError: (err: Error) => setErrors({ form: err.message }),
  });

  // Fed to the preview so the person sees what they are about to commit to,
  // not what is already stored.
  const previewProvision: PrecedenceProvision | null = useMemo(() => {
    if (!draft) return null;
    return {
      id: editingId ?? "draft",
      project: projectId,
      section: draft.section || "This provision",
      page: draft.page,
      scope: draft.scope,
      scope_target: draft.scope_target || null,
      rules: draft.rules,
      resolves: draft.resolves,
      external_instrument: draft.external_instrument_name
        ? { name: draft.external_instrument_name, edition: draft.external_instrument_edition || null }
        : null,
      source_text: draft.source_text,
    };
  }, [draft, editingId, projectId]);

  function updateRule(index: number, next: PrecedenceRule) {
    if (!draft) return;
    setDraft({ ...draft, rules: draft.rules.map((r, i) => (i === index ? next : r)) });
  }
  function move(index: number, delta: number) {
    if (!draft) return;
    const next = [...draft.rules];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, rules: next });
  }

  function submit() {
    if (!draft) return;
    setErrors({});
    const parsed = precedenceProvisionSchema.safeParse({ ...draft, page: draft.page ?? undefined });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    save.mutate(parsed.data as Record<string, unknown>);
  }

  const items = query.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold">Order of precedence</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          {projectName}. Paste the precedence clause from the project manual and record what it
          says. Nothing is extracted automatically — a clause is written once and governs the job,
          and a misread one would be cited by every conflict finding afterwards.
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Recorded provisions ({items.length})</h2>
          <Button variant="outline" onClick={() => { setDraft({ ...BLANK }); setEditingId(null); setConfirmed(false); }}>
            <Plus className="mr-1 size-3" /> Record a provision
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="No provision recorded"
            description="Until one is recorded, every conflict on this project classifies as 'no precedence provision' — which is a finding in itself, but only if it is true."
          />
        ) : (
          <ul className="divide-y divide-neutral-200">
            {items.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-[13px]">
                    {p.section}
                    {p.page ? <span className="text-neutral-400"> · p.{p.page}</span> : null}
                    <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px]">
                      {SCOPES.find((s) => s.value === p.scope)?.label ?? p.scope}
                      {p.scope_target ? ` ${p.scope_target}` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{p.source_text}</p>
                </div>
                <Button variant="ghost" onClick={() => {
                  setDraft({ ...p }); setEditingId(p.id); setConfirmed(false); setErrors({});
                }}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {draft ? (
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold">
            {editingId ? "Edit provision" : "Record a provision"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="source">The clause, exactly as printed</Label>
              <Textarea
                id="source" rows={4} value={draft.source_text}
                placeholder="In case of discrepancy or disagreement in the contract documents, the order of precedence shall be…"
                onChange={(e) => setDraft({ ...draft, source_text: e.target.value })}
              />
              {/* Verbatim text is required at the database too: a classification
                  that cannot be checked against the manual is not usable. */}
              <p className="mt-1 text-[11px] text-neutral-500">
                Verbatim. This is what a reviewer checks the classification against.
              </p>
              {/*
                Advisory, never a block. Roughly half of keyword hits for
                precedence language across four manuals were not
                document-precedence provisions at all, and choosing
                paste-and-confirm moved that error to the person pasting rather
                than removing it. Blocking would be worse: a false warning that
                stops a real provision being recorded costs a whole project.
              */}
              {falsePositiveSignals(draft.source_text).map((signal) => (
                <p key={signal.category} className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  {/* The remedy differs by kind: five of the six are passages
                      about something else, and telling someone a genuine
                      precedence cross-reference "may not be one" would teach
                      them to dismiss the advisory. */}
                  {signal.kind === "POINTS_ELSEWHERE"
                    ? "This is not the provision itself. "
                    : "Check this is the right passage. "}
                  {signal.reason}
                </p>
              ))}
              {errors.source_text ? <p className="mt-1 text-[11px] text-red-600">{errors.source_text}</p> : null}
            </div>

            <div>
              <Label htmlFor="section">Section</Label>
              <Input id="section" value={draft.section} placeholder="SC-6.23"
                onChange={(e) => setDraft({ ...draft, section: e.target.value })} />
              {errors.section ? <p className="mt-1 text-[11px] text-red-600">{errors.section}</p> : null}
            </div>
            <div>
              <Label htmlFor="page">Page</Label>
              <Input id="page" type="number" min={1} value={draft.page ?? ""}
                onChange={(e) => setDraft({ ...draft, page: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="scope">Where it applies</Label>
              <select id="scope" className="h-9 w-full rounded border border-neutral-300 px-2 text-[13px]"
                value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value as PrecedenceScope, rules: e.target.value === "EXTERNAL" ? [] : draft.rules })}>
                {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-neutral-500">
                {SCOPES.find((s) => s.value === draft.scope)?.hint}
              </p>
            </div>

            {draft.scope === "DIVISION_SCOPED" ? (
              <div className="sm:col-span-2">
                <Label htmlFor="target">Which division or section</Label>
                <Input id="target" value={draft.scope_target} placeholder="22"
                  onChange={(e) => setDraft({ ...draft, scope_target: e.target.value })} />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Conflicts outside it will report that no provision reaches them.
                </p>
                {errors.scope_target ? <p className="mt-1 text-[11px] text-red-600">{errors.scope_target}</p> : null}
              </div>
            ) : null}

            {draft.scope === "EXTERNAL" ? (
              <>
                <div>
                  <Label htmlFor="inst">Instrument</Label>
                  <Input id="inst" value={draft.external_instrument_name} placeholder="AIA A201"
                    onChange={(e) => setDraft({ ...draft, external_instrument_name: e.target.value })} />
                  {errors.external_instrument_name ? <p className="mt-1 text-[11px] text-red-600">{errors.external_instrument_name}</p> : null}
                </div>
                <div>
                  <Label htmlFor="ed">Edition (if stated)</Label>
                  <Input id="ed" value={draft.external_instrument_edition} placeholder="2017"
                    onChange={(e) => setDraft({ ...draft, external_instrument_edition: e.target.value })} />
                </div>
              </>
            ) : null}
          </div>

          {draft.scope !== "EXTERNAL" ? (
            <div className="mt-4">
              <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                The decision procedure, in order
              </h3>
              <p className="mb-2 text-[11px] text-neutral-500">
                Rules are tried top to bottom. An override placed above a ranked sequence fires
                before it. A tier holding more than one document is a tie — the sequence will not
                settle a conflict inside it, and the rules below decide instead.
              </p>
              <RuleList rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })}
                onUpdate={updateRule} onMove={move} />
              {errors.rules ? <p className="mt-1 text-[11px] text-red-600">{errors.rules}</p> : null}
            </div>
          ) : null}

          <div className="mt-4">
            <Label>Which conflicts does this clause settle?</Label>
            <p className="mb-1 text-[11px] text-neutral-500">
              Check the preview below against these. A clause can settle one class and not another —
              WCU ranks specifications over drawings AND detail drawings over plans, so it settles
              both E1 and E2.
            </p>
            <div className="flex flex-wrap gap-3">
              {CONFLICT_CLASS_LABELS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-[12px]">
                  <Checkbox
                    checked={draft.resolves.includes(value)}
                    onCheckedChange={(v) =>
                      setDraft({
                        ...draft,
                        resolves:
                          v === true
                            ? [...draft.resolves, value]
                            : draft.resolves.filter((c) => c !== value),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {previewProvision ? (
            <div className="mt-4 rounded border border-neutral-200 bg-neutral-50 p-3">
              <ProvisionPreview provision={previewProvision} />
            </div>
          ) : null}

          {errors.form ? (
            <p className="mt-3 rounded bg-red-50 px-2 py-1 text-[12px] text-red-800">{errors.form}</p>
          ) : null}

          {/*
            Confirming is a separate act from saving. A silent store of a
            misparsed provision is worse than none, because every finding
            afterwards cites it.
          */}
          <label className="mt-4 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-900">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <span>
              I have read the decisions above and they match what the clause says. Recording this
              means conflict findings on this project will cite it.
            </span>
          </label>

          <div className="mt-3 flex gap-2">
            <Button onClick={submit} disabled={!confirmed || save.isPending}>
              {save.isPending ? "Recording…" : "Confirm and record"}
            </Button>
            <Button variant="outline" disabled={save.isPending}
              onClick={() => { setDraft(null); setEditingId(null); setConfirmed(false); }}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RuleList({
  rules, onChange, onUpdate, onMove,
}: {
  rules: PrecedenceRule[];
  onChange: (rules: PrecedenceRule[]) => void;
  onUpdate: (index: number, next: PrecedenceRule) => void;
  onMove: (index: number, delta: number) => void;
}) {
  return (
    <div className="space-y-2">
      {rules.map((rule, index) => (
        <div key={index} className="rounded border border-neutral-200 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium">{index + 1}. {LABELS[rule.type]}</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Move rule ${index + 1} up`} disabled={index === 0}
                onClick={() => onMove(index, -1)} className="text-[10px] text-neutral-500 disabled:opacity-30">▲</button>
              <button type="button" aria-label={`Move rule ${index + 1} down`} disabled={index === rules.length - 1}
                onClick={() => onMove(index, 1)} className="text-[10px] text-neutral-500 disabled:opacity-30">▼</button>
              <Button variant="ghost" aria-label={`Remove rule ${index + 1}`}
                onClick={() => onChange(rules.filter((_, i) => i !== index))}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {rule.type === "OVERRIDE" ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input value={rule.applies_to} placeholder="Special Provisions"
                onChange={(e) => onUpdate(index, { ...rule, applies_to: e.target.value })} />
              <label className="flex items-center gap-2 text-[12px]">
                <Checkbox checked={rule.precedence === "ABSOLUTE"}
                  onCheckedChange={(v) => onUpdate(index, { ...rule, precedence: v === true ? "ABSOLUTE" : undefined })} />
                Applies notwithstanding the sequence
              </label>
            </div>
          ) : null}

          {rule.type === "RANK_SEQUENCE" ? (
            <div className="mt-2 space-y-1">
              {rule.order.map((tier, t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="w-6 text-[11px] text-neutral-400">{t + 1}</span>
                  <Input value={tier.join(", ")} placeholder="Drawings, Specifications"
                    onChange={(e) => {
                      const order = rule.order.map((x, i) =>
                        i === t ? e.target.value.split(",").map((v) => v.trim()).filter(Boolean) : x);
                      onUpdate(index, { ...rule, order });
                    }} />
                  {tier.length > 1 ? <span className="shrink-0 text-[10px] text-amber-700">tied</span> : null}
                </div>
              ))}
              <Button variant="ghost" onClick={() => onUpdate(index, { ...rule, order: [...rule.order, []] })}>
                Add a tier
              </Button>
              <p className="text-[11px] text-neutral-500">
                Comma-separated names in one tier rank equally.
              </p>
            </div>
          ) : null}

          {rule.type === "STRINGENCY" ? (
            <Input className="mt-2" value={rule.condition ?? ""} placeholder="so long as reasonably inferable"
              onChange={(e) => onUpdate(index, { ...rule, condition: e.target.value })} />
          ) : null}

          {rule.type === "DISCRETION" ? (
            <Input className="mt-2" value={rule.authority} placeholder="Architect/Engineer"
              onChange={(e) => onUpdate(index, { ...rule, authority: e.target.value })} />
          ) : null}

          {rule.type === "DEFER" ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input value={rule.to} placeholder="Division 01"
                onChange={(e) => onUpdate(index, { ...rule, to: e.target.value })} />
              <Input value={rule.condition ?? ""} placeholder="when available"
                onChange={(e) => onUpdate(index, { ...rule, condition: e.target.value })} />
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onChange([...rules, { type: "OVERRIDE", applies_to: "" }])}>
          Add override
        </Button>
        <Button variant="outline" onClick={() => onChange([...rules, { type: "RANK_SEQUENCE", order: [[], []] }])}>
          Add ranked sequence
        </Button>
        <Button variant="outline" onClick={() => onChange([...rules, { type: "STRINGENCY" }])}>
          Add stringency rule
        </Button>
        <Button variant="outline" onClick={() => onChange([...rules, { type: "DISCRETION", authority: "" }])}>
          Add discretion
        </Button>
        <Button variant="outline" onClick={() => onChange([...rules, { type: "DEFER", to: "" }])}>
          Add deferral
        </Button>
      </div>
    </div>
  );
}

const LABELS: Record<PrecedenceRule["type"], string> = {
  OVERRIDE: "Override — this document beats the others",
  RANK_SEQUENCE: "Ranked sequence",
  STRINGENCY: "The more stringent requirement applies",
  DISCRETION: "Reserved to a named person",
  DEFER: "Defers to another document",
};
