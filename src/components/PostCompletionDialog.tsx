"use client";

import { useState } from "react";
import {
  CheckCircle2,
  PlayCircle,
  CalendarDays,
  Clock,
  PauseCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  HardHat,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NextJob {
  id: string;
  name: string;
  contractorName: string | null;
  assignedToName: string | null;
}

interface PostCompletionDialogProps {
  open: boolean;
  completedJobName: string;
  /** positive = ahead of programme, negative = behind */
  daysDeviation: number;
  nextJob: NextJob | null;
  plotId: string;
  onClose: () => void;
  onDecisionMade: () => void;
}

export function PostCompletionDialog({
  open,
  completedJobName,
  daysDeviation,
  nextJob,
  plotId,
  onClose,
  onDecisionMade,
}: PostCompletionDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pushWeeks, setPushWeeks] = useState(1);
  const [showPush, setShowPush] = useState(false);

  if (!open) return null;

  const ahead = daysDeviation > 0;
  const behind = daysDeviation < 0;
  const absDays = Math.abs(daysDeviation);

  async function decide(
    decision: "start_today" | "start_next_monday" | "push_weeks" | "leave_for_now",
    weeks?: number
  ) {
    setLoading(decision);
    try {
      const res = await fetch(`/api/plots/${plotId}/restart-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          nextJobId: nextJob?.id,
          pushWeeks: weeks,
        }),
      });
      if (res.ok) {
        onDecisionMade();
        onClose();
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-border/40 px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Job Signed Off
            </p>
          </div>
          <p className="font-semibold text-foreground">{completedJobName}</p>

          {/* Schedule deviation banner */}
          {daysDeviation !== 0 && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                ahead
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              )}
            >
              {ahead ? (
                <TrendingUp className="size-4 shrink-0" />
              ) : (
                <TrendingDown className="size-4 shrink-0" />
              )}
              {absDays} day{absDays !== 1 ? "s" : ""}{" "}
              {ahead ? "ahead of" : "behind"} original programme
            </div>
          )}
          {daysDeviation === 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              <Minus className="size-4 shrink-0" />
              On original programme
            </div>
          )}
        </div>

        {/* Next job preview */}
        <div className="px-6 py-4">
          {nextJob ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Next Job
              </p>
              <div className="rounded-xl border border-border/60 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-foreground">{nextJob.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {nextJob.contractorName && (
                    <span className="flex items-center gap-1">
                      <HardHat className="size-3" />
                      {nextJob.contractorName}
                    </span>
                  )}
                  {nextJob.assignedToName && (
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {nextJob.assignedToName}
                    </span>
                  )}
                  {!nextJob.contractorName && !nextJob.assignedToName && (
                    <span className="text-amber-600">No contractor assigned</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
              <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-700">
                All jobs complete on this plot!
              </p>
            </div>
          )}

          {/* Decision buttons */}
          {nextJob && (
            <div className="mt-4 space-y-2">
              {/* Start today */}
              <button
                onClick={() => decide("start_today")}
                disabled={!!loading}
                className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 transition-all"
              >
                {loading === "start_today" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <PlayCircle className="size-4 shrink-0" />
                )}
                <span>
                  Start today
                  {ahead && absDays > 0 && (
                    <span className="ml-1 font-normal opacity-80">
                      &amp; pull programme forward {absDays}d
                    </span>
                  )}
                </span>
              </button>

              {/* Start next Monday */}
              <button
                onClick={() => decide("start_next_monday")}
                disabled={!!loading}
                className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all"
              >
                {loading === "start_next_monday" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <CalendarDays className="size-4 shrink-0 text-blue-500" />
                )}
                Start next Monday &amp; update programme
              </button>

              {/* Push forward */}
              {!showPush ? (
                <button
                  onClick={() => setShowPush(true)}
                  disabled={!!loading}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all"
                >
                  <Clock className="size-4 shrink-0 text-amber-500" />
                  Push forward by X weeks…
                </button>
              ) : (
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-3">
                    <Clock className="size-4 shrink-0 text-amber-500" />
                    <span className="text-sm font-medium text-foreground">Push</span>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={pushWeeks}
                      onChange={(e) => setPushWeeks(Number(e.target.value))}
                      className="w-14 rounded border border-border bg-background px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-sm text-muted-foreground">week{pushWeeks !== 1 ? "s" : ""}</span>
                  </div>
                  <button
                    onClick={() => decide("push_weeks", pushWeeks)}
                    disabled={!!loading}
                    className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-all"
                  >
                    {loading === "push_weeks" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
              )}

              {/* Leave for now */}
              <button
                onClick={() => decide("leave_for_now")}
                disabled={!!loading}
                className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-accent active:scale-[0.98] disabled:opacity-60 transition-all"
              >
                {loading === "leave_for_now" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <PauseCircle className="size-4 shrink-0" />
                )}
                Leave for now
                <span className="ml-auto text-[11px] text-amber-600">
                  Plot goes inactive
                </span>
              </button>
            </div>
          )}

          {/* Close if no next job */}
          {!nextJob && (
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
