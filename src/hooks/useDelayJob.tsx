"use client";

/**
 * Centralised delay-job flow — single source of truth for "push a job + its
 * downstream programme forward by N working days with a reason".
 *
 * Before: 5 different surfaces (Daily Brief, JobWeekPanel, Walkthrough,
 * JobsClient, TasksClient) each rolled their own dialog with subtly
 * different UX — some days-number, some date-picker, some captured a
 * reason, some didn't.
 *
 * Now: every surface calls `openDelayDialog(job)` from this hook and renders
 * `dialogs` in JSX. The dialog supports BOTH input modes (days or new end
 * date) — user picks — and posts to /api/jobs/:id/delay with a reason that
 * shows up on the Delay Report.
 *
 * See docs/cascade-spec.md action A8 for the engine contract.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2 } from "lucide-react";
import { addWorkingDays, differenceInWorkingDays } from "@/lib/working-days";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DelayReasonType = "WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER";

export interface DelayableJob {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

interface DelayHookResult {
  /** Open the delay dialog for a job. Accepts any object with id/name/dates. */
  openDelayDialog: (job: DelayableJob, defaultDays?: number) => void;
  /** Whether a delay is currently being applied (network roundtrip). */
  isLoading: boolean;
  /** JSX to render somewhere in the tree — the dialog itself. */
  dialogs: ReactNode;
}

export function useDelayJob(onSuccess?: () => void): DelayHookResult {
  const toast = useToast();
  const [target, setTarget] = useState<DelayableJob | null>(null);
  const [inputMode, setInputMode] = useState<"days" | "date">("days");
  const [days, setDays] = useState(1);
  const [pickedEndDate, setPickedEndDate] = useState("");
  const [reasonType, setReasonType] = useState<DelayReasonType>("OTHER");
  const [reasonNote, setReasonNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Weather suggestion — fetched when dialog opens. Pre-selects the reason
  // type if there are rained-off days logged during the job's period so the
  // user doesn't have to manually classify routine weather delays. Same
  // feature that lived in TasksClient + JobWeekPanel before unification.
  const [weatherSuggestion, setWeatherSuggestion] = useState<{
    rainDays: number;
    temperatureDays: number;
  } | null>(null);

  const close = useCallback(() => {
    setTarget(null);
    setInputMode("days");
    setDays(1);
    setPickedEndDate("");
    setReasonType("OTHER");
    setReasonNote("");
    setWeatherSuggestion(null);
  }, []);

  const openDelayDialog = useCallback((job: DelayableJob, defaultDays = 1) => {
    setTarget(job);
    setDays(Math.max(1, defaultDays));
    setPickedEndDate("");
    setReasonType("OTHER");
    setReasonNote("");
    setInputMode("days");
    setWeatherSuggestion(null);
  }, []);

  // Fetch weather suggestion when dialog opens for a specific job. Silent
  // failure on error — this is an enhancement, not a blocker for submitting.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${target.id}/delay`);
        if (!res.ok) return;
        const data = await res.json() as {
          rainDays: number;
          temperatureDays: number;
          suggestedReason: DelayReasonType | null;
        };
        if (cancelled) return;
        setWeatherSuggestion({
          rainDays: data.rainDays ?? 0,
          temperatureDays: data.temperatureDays ?? 0,
        });
        if (data.suggestedReason) setReasonType(data.suggestedReason);
      } catch {
        /* non-critical */
      }
    })();
    return () => { cancelled = true; };
  }, [target]);

  // Resolve the working-day delta from whichever input mode is active.
  // Returns null if the input doesn't produce a positive shift.
  function resolveDays(): number | null {
    if (inputMode === "days") {
      return days > 0 ? days : null;
    }
    if (!target?.endDate || !pickedEndDate) return null;
    const delta = differenceInWorkingDays(new Date(pickedEndDate), new Date(target.endDate));
    return delta > 0 ? delta : null;
  }

  // Preview dates rendered under the input so the user sees what will happen.
  function previewNewDates(): { start: string; end: string } | null {
    if (!target?.startDate || !target?.endDate) return null;
    const resolved = resolveDays();
    if (!resolved) return null;
    const newStart = addWorkingDays(new Date(target.startDate), resolved);
    const newEnd = addWorkingDays(new Date(target.endDate), resolved);
    return { start: format(newStart, "dd MMM"), end: format(newEnd, "dd MMM") };
  }

  async function apply() {
    if (!target) return;
    const resolved = resolveDays();
    if (!resolved || resolved <= 0) {
      toast.error("Delay must be at least 1 working day");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${target.id}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: resolved,
          delayReasonType: reasonType,
          reason: reasonNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? `Failed to delay job (HTTP ${res.status})`);
        return;
      }
      const data = await res.json().catch(() => ({ jobsShifted: 0 }));
      toast.success(
        `Delayed ${resolved} working day${resolved !== 1 ? "s" : ""} — ${data.jobsShifted} downstream job${data.jobsShifted !== 1 ? "s" : ""} shifted`
      );
      close();
      onSuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delay job");
    } finally {
      setSubmitting(false);
    }
  }

  const preview = previewNewDates();
  const resolvedDays = resolveDays();

  const dialogs = (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-amber-600" />
            Delay Job
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{target?.name}</span>
            {target?.startDate ? <> was due to start <strong>{format(new Date(target.startDate), "dd MMM")}</strong>.</> : null}{" "}
            Shift this job and everything downstream forward.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Weather suggestion — only shown if the site has rained-off days
              logged during this job's period. Pre-selects the reason above
              so in the common case the user doesn't need to reclassify. */}
          {weatherSuggestion && (weatherSuggestion.rainDays > 0 || weatherSuggestion.temperatureDays > 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              {weatherSuggestion.rainDays > 0 && (
                <span>☔ {weatherSuggestion.rainDays} rain day{weatherSuggestion.rainDays !== 1 ? "s" : ""}</span>
              )}
              {weatherSuggestion.rainDays > 0 && weatherSuggestion.temperatureDays > 0 && <span> · </span>}
              {weatherSuggestion.temperatureDays > 0 && (
                <span>🌡️ {weatherSuggestion.temperatureDays} temperature day{weatherSuggestion.temperatureDays !== 1 ? "s" : ""}</span>
              )}
              <span className="ml-1 opacity-75">logged on this job&apos;s period — reason pre-selected</span>
            </div>
          )}

          {/* Input mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setInputMode("days")}
              className={cn(
                "flex-1 rounded px-3 py-1 font-medium transition-colors",
                inputMode === "days" ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-accent"
              )}
            >
              By working days
            </button>
            <button
              type="button"
              onClick={() => setInputMode("date")}
              className={cn(
                "flex-1 rounded px-3 py-1 font-medium transition-colors",
                inputMode === "date" ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-accent"
              )}
            >
              By new end date
            </button>
          </div>

          {/* Input — days or date */}
          {inputMode === "days" ? (
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">working day{days !== 1 ? "s" : ""}</span>
              {preview && (
                <span className="ml-auto text-xs text-muted-foreground">
                  → {preview.start} – {preview.end}
                </span>
              )}
            </div>
          ) : (
            <div>
              {target?.endDate && (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Currently ends: <span className="font-medium text-foreground">{format(new Date(target.endDate), "dd MMM yyyy")}</span>
                </p>
              )}
              <Input
                type="date"
                value={pickedEndDate}
                onChange={(e) => setPickedEndDate(e.target.value)}
                min={target?.endDate ? target.endDate.slice(0, 10) : undefined}
              />
              {resolvedDays && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {resolvedDays} working day{resolvedDays !== 1 ? "s" : ""} later than current plan
                </p>
              )}
            </div>
          )}

          {/* Reason picker — matches Delay Report enum */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reason</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { v: "WEATHER_RAIN" as const, label: "Rain", emoji: "☔" },
                { v: "WEATHER_TEMPERATURE" as const, label: "Temperature", emoji: "🌡️" },
                { v: "OTHER" as const, label: "Other", emoji: "⏳" },
              ].map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setReasonType(r.v)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                    reasonType === r.v
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "border-border bg-white text-muted-foreground hover:bg-slate-50"
                  )}
                >
                  <span className="mr-1">{r.emoji}</span>{r.label}
                </button>
              ))}
            </div>
          </div>

          {reasonType === "OTHER" && (
            <div className="space-y-1.5">
              <Label htmlFor="delay-note" className="text-xs font-medium">
                Notes <span className="text-muted-foreground">(optional — shows on delay report)</span>
              </Label>
              <Input
                id="delay-note"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="e.g. Contractor no-show, material not on site yet"
                maxLength={200}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Dependent jobs on the same plot will shift by the same amount.
          </p>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button size="sm" disabled={submitting || !resolvedDays} onClick={apply}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
            Delay {resolvedDays ?? ""} day{resolvedDays !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openDelayDialog, isLoading: submitting, dialogs };
}
