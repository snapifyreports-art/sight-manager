"use client";

import { useEffect, useState } from "react";

// (Jun 2026) Quality & compliance analytics — the flagship QA roll-up.
// Pulls the pre-aggregated shape from /api/analytics/quality (scoped to the
// user's accessible sites server-side) and renders it as stat tiles plus two
// compact breakdown sections. Self-contained: no shared imports beyond React.

interface QualityData {
  hasData: boolean;
  inspections: {
    firstTimePassRate: number | null;
    passed: number;
    failed: number;
    open: number;
    byType: Array<{ type: string; total: number; passed: number }>;
  };
  ncrs: {
    open: number;
    avgDaysOpen: number | null;
    byStatus: Record<string, number>;
    total: number;
  };
  snags: {
    open: number;
    avgResolutionDays: number | null;
    openByPriority: Record<string, number>;
  };
  defects: { open: number };
  compliance: { expired: number; expiringSoon: number };
}

// Human labels for the inspection-type column. Falls back to the raw enum.
const TYPE_LABEL: Record<string, string> = {
  NHBC: "NHBC",
  BUILDING_CONTROL: "Building Control",
  WARRANTY_CML: "Warranty / CML",
  INTERNAL_QA: "Internal QA",
  OTHER: "Other",
};

// Open-snag priority chips, highest severity first.
const PRIORITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

export function QualityWidget() {
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (May 2026 pattern sweep) Cancellation flag — avoids a setState after
    // unmount if the widget is torn down mid-fetch.
    let cancelled = false;
    fetch("/api/analytics/quality")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  // Empty install (no quality records anywhere in scope) renders nothing.
  if (!data || !data.hasData) return null;

  const { inspections, ncrs, snags, defects, compliance } = data;
  const fmt = (n: number) => Number(n).toLocaleString();
  const totalOpenSnags = PRIORITY_ORDER.reduce(
    (sum, p) => sum + (snags.openByPriority[p] ?? 0),
    0,
  );

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Quality &amp; compliance</h3>
      <p className="text-xs text-muted-foreground">
        First-time inspection pass rate, open NCRs / snags / defects, and
        compliance expiry across your sites.
      </p>

      {/* Stat tiles — the headline QA numbers. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">
            {inspections.firstTimePassRate === null
              ? "—"
              : `${inspections.firstTimePassRate}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            First-time pass rate
          </div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(ncrs.open)}</div>
          <div className="text-xs text-muted-foreground">
            NCRs open
            {ncrs.avgDaysOpen !== null
              ? ` · ${fmt(ncrs.avgDaysOpen)}d avg`
              : ""}
          </div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(snags.open)}</div>
          <div className="text-xs text-muted-foreground">
            Snags open
            {snags.avgResolutionDays !== null
              ? ` · ${fmt(snags.avgResolutionDays)}d to fix`
              : ""}
          </div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(defects.open)}</div>
          <div className="text-xs text-muted-foreground">Defects open</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(compliance.expired)}</div>
          <div className="text-xs text-muted-foreground">
            Compliance expired
            {compliance.expiringSoon > 0
              ? ` · ${fmt(compliance.expiringSoon)} expiring soon`
              : ""}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Inspections by type — total + passed. */}
        {inspections.byType.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-700">
              Inspections by type
            </p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left">Type</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Passed</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.byType.map((t) => (
                    <tr key={t.type} className="border-t">
                      <td className="font-medium">
                        {TYPE_LABEL[t.type] ?? t.type}
                      </td>
                      <td className="text-right">{fmt(t.total)}</td>
                      <td className="text-right text-slate-500">
                        {fmt(t.passed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Open snags by priority — mini chip row. */}
        <div>
          <p className="text-xs font-medium text-slate-700">
            Open snags by priority
          </p>
          {totalOpenSnags === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No open snags.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {PRIORITY_ORDER.map((p) => {
                const count = snags.openByPriority[p] ?? 0;
                if (count === 0) return null;
                return (
                  <span
                    key={p}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      PRIORITY_STYLE[p] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                    <span className="font-bold">{fmt(count)}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
