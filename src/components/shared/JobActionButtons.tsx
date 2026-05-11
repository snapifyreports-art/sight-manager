"use client";

import { useState } from "react";
import { Play, CheckCircle2, Clock, CalendarClock, FileCheck, Loader2 } from "lucide-react";
import { useJobAction } from "@/hooks/useJobAction";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * Shared job action buttons — consistent context-dependent actions per job status.
 *
 * Status → Actions:
 * - NOT_STARTED → Start [Job Name], Push, Extend
 * - IN_PROGRESS → Sign Off / Complete, Extend, Delay
 * - COMPLETED (not signed off) → Sign Off
 * - COMPLETED (signed off) → Done badge
 *
 * All Start actions go through the centralised useJobAction hook.
 * Used in: Daily Brief, Walkthrough, Programme panel, Calendar.
 */

export interface JobForButtons {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  signedOffAt?: string | null;
}

interface Props {
  job: JobForButtons;
  onRefresh?: () => void;
  /** Compact mode for tight spaces (smaller buttons, no labels) */
  compact?: boolean;
  /** Show the Delay/Push button */
  showDelay?: boolean;
  /** Show the Extend button */
  showExtend?: boolean;
  /** Custom class for the container */
  className?: string;
}

export function JobActionButtons({
  job,
  onRefresh,
  compact = false,
  showDelay = true,
  showExtend = true,
  className = "",
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();

  // Centralised start hook
  const { triggerAction: triggerStart, dialogs: startDialogs } = useJobAction(
    async () => { onRefresh?.(); }
  );

  const btnBase = compact
    ? "inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50"
    : "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

  const handleAction = async (action: string) => {
    if (action === "start") {
      await triggerStart(
        { id: job.id, name: job.name, status: job.status, startDate: job.startDate, endDate: job.endDate },
        "start"
      );
      return;
    }

    setLoading(action);
    try {
      const body: Record<string, unknown> = { action };
      const res = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, `Failed to ${action} job`));
        return;
      }
      onRefresh?.();
    } finally {
      setLoading(null);
    }
  };

  const handlePush = async () => {
    // For now, use the triggerStart flow which handles early/late
    await triggerStart(
      { id: job.id, name: job.name, status: job.status, startDate: job.startDate, endDate: job.endDate },
      "start"
    );
  };

  const isLoading = (action: string) => loading === action;

  return (
    <>
      {startDialogs}
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {/* NOT_STARTED */}
        {job.status === "NOT_STARTED" && (
          <>
            <button
              onClick={() => handleAction("start")}
              disabled={!!loading}
              className={`${btnBase} border-green-200 text-green-700 hover:bg-green-50`}
            >
              {isLoading("start") ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              {!compact && <span>Start</span>}
            </button>
            {showDelay && (
              <button
                onClick={handlePush}
                disabled={!!loading}
                className={`${btnBase} border-amber-200 text-amber-700 hover:bg-amber-50`}
              >
                <CalendarClock className="size-3" />
                {!compact && <span>Push</span>}
              </button>
            )}
            {showExtend && (
              <button
                onClick={() => handleAction("extend")}
                disabled={!!loading}
                className={`${btnBase} border-orange-200 text-orange-700 hover:bg-orange-50`}
              >
                <Clock className="size-3" />
                {!compact && <span>Extend</span>}
              </button>
            )}
          </>
        )}

        {/* IN_PROGRESS */}
        {job.status === "IN_PROGRESS" && (
          <>
            <button
              onClick={() => handleAction("complete")}
              disabled={!!loading}
              className={`${btnBase} border-blue-200 text-blue-700 hover:bg-blue-50`}
            >
              {isLoading("complete") ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              {!compact && <span>Mark Complete</span>}
            </button>
            {showExtend && (
              <button
                onClick={() => handleAction("extend")}
                disabled={!!loading}
                className={`${btnBase} border-orange-200 text-orange-700 hover:bg-orange-50`}
              >
                <Clock className="size-3" />
                {!compact && <span>Extend</span>}
              </button>
            )}
            {showDelay && (
              <button
                onClick={() => handleAction("delay")}
                disabled={!!loading}
                className={`${btnBase} border-red-200 text-red-700 hover:bg-red-50`}
              >
                <CalendarClock className="size-3" />
                {!compact && <span>Delay</span>}
              </button>
            )}
          </>
        )}

        {/* COMPLETED but not signed off */}
        {job.status === "COMPLETED" && !job.signedOffAt && (
          <button
            onClick={() => handleAction("signoff")}
            disabled={!!loading}
            className={`${btnBase} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}
          >
            {isLoading("signoff") ? <Loader2 className="size-3 animate-spin" /> : <FileCheck className="size-3" />}
            {!compact && <span>Sign Off</span>}
          </button>
        )}

        {/* COMPLETED and signed off */}
        {job.status === "COMPLETED" && job.signedOffAt && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 ${compact ? "" : "px-2 py-1"}`}>
            <CheckCircle2 className="size-3" /> Done
          </span>
        )}
      </div>
    </>
  );
}
