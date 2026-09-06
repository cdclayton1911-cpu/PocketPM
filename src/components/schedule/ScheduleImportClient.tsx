"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DATE_FIELDS, NUMBER_FIELDS, TARGET_FIELDS, type TargetField } from "@/lib/import/mapping";
import type { DryRunReport } from "@/lib/import/dryrun";

type Step = "upload" | "map" | "preview" | "done";
type Order = "day-first" | "month-first";

const REQUIRED: TargetField[] = ["activity_id"];

export function ScheduleImportClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<TargetField, number>>>({});
  const [order, setOrder] = useState<Order>("month-first");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ activities: number; relationships: number } | null>(null);

  async function runPreview(next?: { mapping?: typeof mapping; order?: Order }) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("order", next?.order ?? order);
      if (next?.mapping ?? Object.keys(mapping).length) {
        body.append("mapping", JSON.stringify(next?.mapping ?? mapping));
      }
      const res = await fetch("/api/schedule/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.errors?.form ?? "Could not read that file");
      setReport(data.report);
      setMapping(data.mapping);
      setStep((s) => (s === "upload" ? "map" : s));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mapping", JSON.stringify(mapping));
      body.append("order", order);
      body.append("acknowledgeBaselineOrphans", String(acknowledged));
      const res = await fetch("/api/schedule/import", { method: "PUT", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.errors?.form ?? "Import failed");
      setResult(data.imported);
      setStep("done");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const orphaning = (report?.baselines ?? []).filter((b) => b.willOrphan > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold">Import a schedule</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          CSV only. Export from Excel or P6 with File → Save As → CSV. The file is read and
          discarded — it is not stored. Importing <strong>replaces</strong> this project&apos;s
          activities and their dependencies.
        </p>
      </div>

      {step === "upload" ? (
        <Card className="p-4">
          <Label htmlFor="csv">CSV file</Label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-[13px]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button className="mt-3" disabled={!file || busy} onClick={() => runPreview()}>
            {busy ? "Reading…" : "Read the file"}
          </Button>
        </Card>
      ) : null}

      {report && step !== "upload" && step !== "done" ? (
        <>
          <Card className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold">What was detected</h2>
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-[11px] uppercase text-neutral-400">Encoding</dt>
                {/* Shown, not inferred: mojibake is well-formed output. */}
                <dd>
                  {report.encoding}
                  {report.encodingGuessed ? (
                    <span className="ml-1 text-[11px] text-neutral-500">(no BOM — detected)</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-neutral-400">Delimiter</dt>
                <dd>{report.delimiter === "\t" ? "tab" : report.delimiter}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-neutral-400">Rows</dt>
                <dd>
                  {report.counts.activities} activities, {report.counts.relationships} dependencies
                </dd>
              </div>
            </dl>
            {report.unmapped.length ? (
              <p className="mt-2 text-[12px] text-neutral-500">
                Not imported: {report.unmapped.join(", ")}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-[13px] font-semibold">Dates</h2>
            <p className="mb-2 text-[12px] text-neutral-500">
              A spreadsheet does not record which way round its dates are, so <code>03/04/2026</code>{" "}
              is either 3 April or 4 March. Choose, then check the parsed values below.
            </p>
            <div className="flex gap-3">
              {(["month-first", "day-first"] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="radio"
                    name="order"
                    checked={order === o}
                    onChange={() => {
                      setOrder(o);
                      void runPreview({ order: o });
                    }}
                  />
                  {o === "month-first" ? "Month first (03/04 = 4 March)" : "Day first (03/04 = 3 April)"}
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold">Columns</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {TARGET_FIELDS.map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-[12px]">
                    {field}
                    {REQUIRED.includes(field) ? <span className="text-red-600"> *</span> : null}
                  </span>
                  <select
                    className="h-8 flex-1 rounded border border-neutral-300 px-2 text-[13px]"
                    value={mapping[field] ?? ""}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value === "") delete next[field];
                      else next[field] = Number(e.target.value);
                      setMapping(next);
                      void runPreview({ mapping: next });
                    }}
                  >
                    <option value="">— not imported —</option>
                    {report.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `(column ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Dependencies come from the predecessors column, comma separated. Accepted:{" "}
              <code>A100</code>, <code>A100FS</code>, <code>A100SS-1</code>, <code>A100FS+2</code>.
              An ID on its own means finish-to-start with no lag.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold">First rows, as read</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1 pr-3">Activity</th>
                    {[...DATE_FIELDS, ...NUMBER_FIELDS].map((f) => (
                      <th key={f} className="py-1 pr-3">
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.sample.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-neutral-200">
                      <td className="py-1 pr-3">{row.activity_id}</td>
                      {[...DATE_FIELDS, ...NUMBER_FIELDS].map((f) => {
                        const cell = row.cells[f];
                        return (
                          <td key={f} className="py-1 pr-3">
                            {/* Raw beside parsed, so the interpretation is visible
                                before it is committed. */}
                            {cell?.raw ? (
                              <>
                                <span className="text-neutral-400">{cell.raw}</span>
                                <span className="mx-1 text-neutral-300">→</span>
                                <span className={cn(cell.value === null && "text-red-600")}>
                                  {cell.value === null ? "unreadable" : String(cell.value)}
                                </span>
                              </>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {report.problems.length ? (
            <Card className="p-4">
              <h2 className="mb-2 text-[13px] font-semibold">
                {report.counts.errors} error{report.counts.errors === 1 ? "" : "s"},{" "}
                {report.counts.warnings} warning{report.counts.warnings === 1 ? "" : "s"}
              </h2>
              <ul className="max-h-56 space-y-1 overflow-y-auto text-[12px]">
                {report.problems.slice(0, 100).map((p, i) => (
                  <li key={i} className={cn(p.severity === "error" ? "text-red-700" : "text-amber-700")}>
                    {p.rowNumber > 0 ? `Row ${p.rowNumber}` : "File"}
                    {p.field ? ` · ${p.field}` : ""}: {p.message}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {orphaning.length ? (
            <Card className="border-amber-300 bg-amber-50 p-4">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div className="text-[12px] text-amber-900">
                  <p className="font-medium">This import will detach baseline items.</p>
                  {orphaning.map((b) => (
                    <p key={b.baselineId} className="mt-1">
                      <strong>{b.baselineName}</strong>: {b.willMatch} of {b.totalItems} items will
                      still match; <strong>{b.willOrphan}</strong> will not
                      {b.orphanedSample.length ? ` (${b.orphanedSample.slice(0, 5).join(", ")}…)` : null}.
                    </p>
                  ))}
                  <p className="mt-2">
                    Baselines match activities by activity ID. An item that stops matching is not
                    reported as variance — it simply disappears from the comparison, which is the
                    most misleading answer a delay claim can be given.
                  </p>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
                    I understand, import anyway
                  </label>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setReport(null);
              }}
              disabled={busy}
            >
              <ArrowLeft className="mr-1 size-3" /> Choose another file
            </Button>
            <Button
              onClick={commit}
              disabled={busy || !report.canImport || (orphaning.length > 0 && !acknowledged)}
            >
              {busy ? "Importing…" : `Replace the schedule with ${report.counts.activities} activities`}
            </Button>
          </div>
          {!report.canImport ? (
            <p className="text-[12px] text-red-700">
              Fix the errors above, or remap the columns, before importing.
            </p>
          ) : null}
        </>
      ) : null}

      {step === "done" && result ? (
        <Card className="p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
            <div>
              <h2 className="text-[13px] font-semibold">Schedule imported</h2>
              <p className="mt-0.5 text-[13px] text-neutral-600">
                {result.activities} activities and {result.relationships} dependencies.
              </p>
              <p className="mt-2 text-[12px] text-neutral-500">
                <FileText className="mr-1 inline size-3" />
                The source file was not kept. Upload it to project documents if you need it on record.
              </p>
              <Button className="mt-3" variant="outline" onClick={() => router.push("/schedule/analysis")}>
                See the critical path
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
