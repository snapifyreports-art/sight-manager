"use client";

/**
 * Shared "Failed to load — Retry" banner for report-style pages.
 *
 * Before: Budget, CashFlow, ContractorComms, CriticalPath, DelayReport,
 * and WeeklySite each had character-identical copies of this 6-line
 * snippet. Three more reports (DailySiteBrief, ContractorDaySheets,
 * SiteCalendar) had no error UI at all — failed loads showed blank.
 *
 * Now: single component. Every report imports and renders this. Future
 * style changes or error telemetry hooks happen in one place.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";

interface ReportErrorBannerProps {
  /** The error message to display. Usually the Prisma/server error. */
  message: string;
  /** Click handler — typically `() => setLoaded(null)` or equivalent
   *  to re-trigger the fetch effect. */
  onRetry: () => void;
  /** Optional title override. Default: "Failed to load". */
  title?: string;
}

export function ReportErrorBanner({
  message,
  onRetry,
  title = "Failed to load",
}: ReportErrorBannerProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 break-words text-xs text-red-600">{message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="size-3" />
          Retry
        </button>
      </div>
    </div>
  );
}
