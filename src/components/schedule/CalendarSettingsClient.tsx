"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  holidayCoverageGap,
  seedHolidays,
  type Holiday,
  type ProjectCalendar,
} from "@/lib/schedule/calendar";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function CalendarSettingsClient({
  projectId,
  projectName,
  isOwner,
  initial,
  projectStart,
  projectEnd,
  scheduleEnds,
}: {
  projectId: string;
  projectName: string;
  /** Only the project owner may write these — projects.updateRule. */
  isOwner: boolean;
  initial: ProjectCalendar;
  projectStart: string;
  projectEnd: string;
  /** Latest date on the schedule, for the coverage warning. */
  scheduleEnds: string;
}) {
  const queryClient = useQueryClient();
  const [workDays, setWorkDays] = useState<number[]>(initial.work_days);
  const [holidays, setHolidays] = useState<Holiday[]>(initial.holidays);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const gap = holidayCoverageGap({ work_days: workDays, holidays }, scheduleEnds);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_days: workDays, holidays }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.form ?? "Could not save the calendar");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Calendar saved.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold">Working calendar</h1>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          {projectName}. Schedule dates are calculated against these working days, so changing them
          moves every computed date on the job.
        </p>
      </div>

      {!isOwner ? (
        // Disabled rather than 403-ing: a member can see the calendar their
        // dates are computed against, they just cannot change it.
        <p className="rounded bg-neutral-100 px-3 py-2 text-[12px] text-neutral-600">
          Only the project owner can change the working calendar. You can see it here.
        </p>
      ) : null}

      {gap ? (
        <div className="flex gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">The schedule runs past the holidays on file.</p>
            <p className="mt-0.5">
              Holidays are listed{" "}
              {gap.coveredThrough ? (
                <>
                  through <strong>{gap.coveredThrough}</strong>
                </>
              ) : (
                <strong>not at all</strong>
              )}
              , but the schedule runs to <strong>{gap.scheduleEnds}</strong>. Dates after that are
              calculated with no holidays — work will be scheduled through Christmas. Add the
              missing years below.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="p-4">
        <h2 className="mb-2 text-[13px] font-semibold">Working days</h2>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-1.5 text-[13px]">
              <Checkbox
                checked={workDays.includes(day.value)}
                disabled={!isOwner || save.isPending}
                onCheckedChange={(v) =>
                  setWorkDays((prev) =>
                    v === true
                      ? [...prev, day.value].sort((a, b) => a - b)
                      : prev.filter((d) => d !== day.value),
                  )
                }
              />
              {day.label}
            </label>
          ))}
        </div>
        {workDays.length === 0 ? (
          <p className="mt-2 text-[12px] text-red-700">
            No working days selected — no schedule date can be calculated at all.
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Holidays ({holidays.length})</h2>
          {isOwner ? (
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                // Concrete dates for this project's span, not a recurrence
                // rule. Merged, so hand-added entries survive a re-seed.
                const seeded = seedHolidays(projectStart, projectEnd || scheduleEnds || projectStart);
                const known = new Set(holidays.map((h) => h.date));
                const added = seeded.filter((h) => !known.has(h.date));
                setHolidays([...holidays, ...added].sort((a, b) => (a.date < b.date ? -1 : 1)));
                toast.success(`Added ${added.length} US holidays. Edit or remove any you work.`);
              }}
            >
              Add US holidays for this project
            </Button>
          ) : null}
        </div>

        {holidays.length === 0 ? (
          <p className="text-[12px] text-neutral-500">
            No holidays. Every weekday will be treated as workable, including Christmas.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-neutral-200 overflow-y-auto">
            {holidays.map((h, index) => (
              <li key={`${h.date}-${index}`} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[13px]">
                  <span className="tabular-nums">{h.date}</span>
                  {h.label ? <span className="ml-2 text-neutral-500">{h.label}</span> : null}
                </span>
                {isOwner ? (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove ${h.label ?? h.date}`}
                    disabled={save.isPending}
                    onClick={() => setHolidays(holidays.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                disabled={save.isPending}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="holiday-label">Label (optional)</Label>
              <Input
                id="holiday-label"
                value={newLabel}
                placeholder="Site shutdown"
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={save.isPending}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!newDate || save.isPending}
              onClick={() => {
                if (holidays.some((h) => h.date === newDate)) {
                  toast.error("That date is already a holiday.");
                  return;
                }
                setHolidays(
                  [...holidays, { date: newDate, label: newLabel || undefined }].sort((a, b) =>
                    a.date < b.date ? -1 : 1,
                  ),
                );
                setNewDate("");
                setNewLabel("");
              }}
            >
              Add
            </Button>
          </div>
        ) : null}
      </Card>

      <p className="text-[11px] text-neutral-500">
        Weather days are not calendar entries. A weather day is a retroactive determination that a
        specific date was unworkable, and belongs with the daily log as claim evidence — putting it
        here would edit the as-planned schedule a claim is argued against.
      </p>

      {isOwner ? (
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save calendar"}
        </Button>
      ) : null}
    </div>
  );
}
