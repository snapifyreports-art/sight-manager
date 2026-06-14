"use client";

import { useEffect, useState } from "react";
import { PLATFORM, PLATFORM_PRIMARY } from "@/lib/platform";

/**
 * (Jun 2026 white-label) Branded error boundary for the dashboard segment.
 * MUST be a client component (Next requirement for error.tsx) and accept
 * { error, reset }. Themes itself from the PUBLIC GET /api/settings/branding
 * endpoint; if that fetch fails we degrade to the platform mark so the page
 * still renders.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [primaryColor, setPrimaryColor] = useState(PLATFORM_PRIMARY);

  useEffect(() => {
    // Log so the digest surfaces in monitoring.
    console.error(error);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
      })
      .catch(() => {
        /* keep the platform fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-slate-500">
          An unexpected error occurred. You can try again, and if it keeps
          happening please contact support.
        </p>
      </div>

      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110"
        style={{ backgroundColor: primaryColor }}
      >
        Try again
      </button>

      <p className="text-xs text-slate-400">{PLATFORM.poweredBy}</p>
    </div>
  );
}
