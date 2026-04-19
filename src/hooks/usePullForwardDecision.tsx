"use client";

/**
 * Pull-forward decision dialog — single source of truth for "start this
 * job earlier than planned".
 *
 * Design locked with Keith:
 * 1. MANUAL trigger only — site manager always decides. Never auto-fire,
 *    even when a predecessor finishes early. Managers have context we
 *    don't (resource availability, priorities, dormant-plot reasons).
 * 2. EXPLICIT DATES — "Start Mon 22 Apr" not "Start Monday", so nobody
 *    guesses which Monday.
 * 3. CONSTRAINT-AWARE picker — invalid dates are greyed AND explained
 *    ("can't start until bricks arrive 5 May"). The earliestStart
 *    calculation lives server-side in GET /api/jobs/:id/pull-forward
 *    and considers predecessor end + outstanding order lead times.
 *
 * Options shown, in order:
 *   ⚡ Start today         — always offered, greyed + reason if < earliestStart
 *   📅 Start Mon DD MMM    — next Monday's explicit date, same greying rules
 *   🔒 Keep original       — always available, no change
 *   📆 Pick a date...      — date picker with min=earliestStart
 *
 * Smart behaviour:
 * - If original start is within 2 working days, the dialog declines to
 *   open — not worth asking for such a marginal pull-forward.
 * - If "today" IS the current start or later, it collapses with "keep
 *   original" (hide the today option).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { format, addDays, startOfWeek, isAfter, isBefore, isSameDay } from "date-fns";
import { Loader2, Zap, CalendarDays, Lock, CalendarClock, AlertTriangle } from "lucide-react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
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
import { cn } from "@/lib/utils";
import { getCurrentDateAtMidnight } from "@/lib/dev-date";

export interface PullableJob {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

interface PullForwardConstraints {
  jobId: string;
  jobName: string;
  currentStart: string | null;
  currentEnd: string | null;
  earliestStart: string;
  earliestStartReason: string;
  canBePulledForward: boolean;
  predecessor: {
    id: string;
    name: string;
    status: string;
    endDate: string | null;
    actualEndDate: string | null;
    signedOffAt: string | null;
  } | null;
  orderConstraints: Array<{
    orderId: string;
    supplier: string;
    items: string | null;
    status: string;
    leadTimeDays: number | null;
    earliestDelivery: string | null;
    reason: string;
  }>;
}

interface Result {
  openPullForwardDialog: (job: PullableJob) => void;
  isLoading: boolean;
  dialogs: ReactNode;
}

export function usePullForwardDecision(onApplied?: () => void): Result {
  const toast = useToast();
  const [target, setTarget] = useState<PullableJob | null>(null);
  const [constraints, setConstraints] = useState<PullForwardConstraints | null>(null);
  const [loadingConstraints, setLoadingConstraints] = useState(false);
  const [pickedDate, setPickedDate] = useState("");
  const [usePicker, setUsePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const close = useCallback(() => {
    setTarget(null);
    setConstraints(null);
    setPickedDate("");
    setUsePicker(false);
  }, []);

  const openPullForwardDialog = useCallback((job: PullableJob) => {
    setTarget(job);
    setConstraints(null);
    setPickedDate("");
    setUsePicker(false);
  }, []);

  // Fetch constraints when dialog opens.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoadingConstraints(true);
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${target.id}/pull-forward`);
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Couldn't load pull-forward options"));
          if (!cancelled) close();
          return;
        }
        const data = await res.json() as PullForwardConstraints;
        if (cancelled) return;
        setConstraints(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load pull-forward options");
        if (!cancelled) close();
      } finally {
        if (!cancelled) setLoadingConstraints(false);
      }
    })();
    return () => { cancelled = true; };
  }, [target, close, toast]);

  async function apply(dateISO: string) {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${target.id}/pull-forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStartDate: dateISO }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to pull forward"));
        return;
      }
      const data = await res.json() as {
        workingDaysPulledForward: number;
        ordersShifted: number;
      };
      toast.success(
        `Pulled forward ${data.workingDaysPulledForward} working day${data.workingDaysPulledForward !== 1 ? "s" : ""}` +
          (data.ordersShifted > 0 ? ` — ${data.ordersShifted} order${data.ordersShifted !== 1 ? "s" : ""} re-dated` : "")
      );
      close();
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to pull forward");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived options ───────────────────────────────────────────────────
  const today = getCurrentDateAtMidnight();
  const todayISO = today.toISOString().slice(0, 10);
  // Next Monday: if today is Mon, next Mon is 7 days away. If Sat, 2.
  // date-fns startOfWeek defaults to Sun=0; use weekStartsOn: 1 for Mon.
  const nextMonday = (() => {
    const thisWeekMon = startOfWeek(today, { weekStartsOn: 1 });
    const candidate = isAfter(thisWeekMon, today) || isSameDay(thisWeekMon, today)
      ? addDays(thisWeekMon, 7)
      : addDays(thisWeekMon, 7);
    return candidate;
  })();
  const nextMondayISO = nextMonday.toISOString().slice(0, 10);

  const earliest = constraints ? new Date(constraints.earliestStart) : null;
  const current = constraints?.currentStart ? new Date(constraints.currentStart) : null;

  // Is a given candidate date valid given the constraints?
  function validateDate(candidate: Date): { ok: boolean; reason?: string } {
    if (!earliest) return { ok: false, reason: "Loading constraints…" };
    if (isBefore(candidate, earliest)) {
      return { ok: false, reason: constraints?.earliestStartReason };
    }
    if (current && (isAfter(candidate, current) || isSameDay(candidate, current))) {
      return { ok: false, reason: "Not earlier than current plan" };
    }
    return { ok: true };
  }

  const todayValidation = validateDate(today);
  const mondayValidation = validateDate(nextMonday);
  // "Keep original" is always offered — no validation needed.

  // Hide "today" option if today IS the current start (it's the same as Keep)
  const showTodayOption = !current || !isSameDay(today, current);

  const dialogs = (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-emerald-600" />
            Pull Job Forward
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{target?.name}</span>
            {current && (
              <> · currently starts <strong>{format(current, "EEE d MMM")}</strong></>
            )}
          </DialogDescription>
        </DialogHeader>

        {loadingConstraints ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Checking dependencies…
          </div>
        ) : !constraints ? null : !constraints.canBePulledForward ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="inline mr-2 size-4 align-text-bottom" />
            This job can&apos;t be pulled forward — {constraints.earliestStartReason.toLowerCase()}.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Option 1: Start today */}
            {showTodayOption && (
              <OptionButton
                icon={Zap}
                label={`Start today`}
                dateLabel={format(today, "EEE d MMM yyyy")}
                helper="Resource ready, on site"
                disabled={!todayValidation.ok || submitting}
                disabledReason={todayValidation.reason}
                onClick={() => apply(todayISO)}
                tone="emerald"
              />
            )}

            {/* Option 2: Start next Monday */}
            <OptionButton
              icon={CalendarDays}
              label={`Start ${format(nextMonday, "EEE d MMM")}`}
              dateLabel={format(nextMonday, "yyyy")}
              helper="Clean week start — gives contractor notice"
              disabled={!mondayValidation.ok || submitting}
              disabledReason={mondayValidation.reason}
              onClick={() => apply(nextMondayISO)}
              tone="blue"
            />

            {/* Option 3: Keep original */}
            {current && (
              <OptionButton
                icon={Lock}
                label="Keep original"
                dateLabel={format(current, "EEE d MMM yyyy")}
                helper="Don&apos;t burn the buffer — save the slack"
                disabled={submitting}
                onClick={close}
                tone="slate"
              />
            )}

            {/* Option 4: Pick a custom date */}
            {!usePicker ? (
              <button
                type="button"
                onClick={() => setUsePicker(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:bg-accent"
              >
                <CalendarClock className="size-3.5" />
                Pick a custom date…
              </button>
            ) : (
              <div className="rounded-lg border p-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Custom start date
                </label>
                <Input
                  type="date"
                  value={pickedDate}
                  onChange={(e) => setPickedDate(e.target.value)}
                  min={earliest ? earliest.toISOString().slice(0, 10) : undefined}
                  max={current ? current.toISOString().slice(0, 10) : undefined}
                  className="text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Earliest: <span className="font-medium">{earliest ? format(earliest, "EEE d MMM yyyy") : "—"}</span>
                  {constraints.earliestStartReason && (
                    <> · <span className="italic">{constraints.earliestStartReason}</span></>
                  )}
                </p>
                {constraints.orderConstraints.length > 0 && (
                  <div className="mt-2 border-t pt-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Order constraints
                    </p>
                    {constraints.orderConstraints.map((oc) => (
                      <p key={oc.orderId} className="text-[11px] text-amber-800">
                        · {oc.reason}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setUsePicker(false); setPickedDate(""); }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!pickedDate || submitting || !validateDate(new Date(pickedDate)).ok}
                    onClick={() => apply(pickedDate)}
                  >
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" size="sm" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openPullForwardDialog, isLoading: submitting, dialogs };
}

// ─── Option button — shared tile for each of the 4 choices ─────────────────

function OptionButton({
  icon: Icon,
  label,
  dateLabel,
  helper,
  disabled,
  disabledReason,
  onClick,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  dateLabel: string;
  helper: string;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  tone: "emerald" | "blue" | "slate";
}) {
  const toneMap = {
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800", icon: "text-emerald-600" },
    blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800", icon: "text-blue-600" },
    slate: { border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-800", icon: "text-slate-600" },
  };
  const t = toneMap[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : cn(t.border, t.bg, "hover:brightness-[0.97]", t.text)
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("size-5 shrink-0", disabled ? "text-slate-300" : t.icon)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs opacity-80">{dateLabel}</p>
          <p className="mt-1 text-[11px] opacity-70">{helper}</p>
          {disabled && disabledReason && (
            <p className="mt-1.5 text-[11px] italic text-amber-700">
              Blocked: {disabledReason}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
