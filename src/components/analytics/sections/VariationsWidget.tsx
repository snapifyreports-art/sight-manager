"use client";

import { useEffect, useState } from "react";

interface VariationsData {
  total: number;
  countByStatus: Record<string, number>;
  totalCostAdded: number;
  totalDaysAdded: number;
  approvedCount: number;
  pendingCount: number;
  bySite: Array<{
    siteName: string;
    cost: number;
    days: number;
    count: number;
  }>;
}

/**
 * (Jun 2026) Variations-impact widget.
 *
 * Shows the cost and programme impact of plot variations across the
 * portfolio: pounds added, working-days added, total raised, and how
 * many are still awaiting approval — plus a per-status breakdown and
 * the top sites by variation cost.
 *
 * Renders nothing on an empty install (no variations recorded).
 */
export function VariationsWidget() {
  const [data, setData] = useState<VariationsData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (May 2026 pattern sweep) Cancellation flag — avoids a setState
    // after unmount if the widget is torn down mid-fetch.
    let cancelled = false;
    fetch("/api/analytics/variations")
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
  // Empty install — nothing recorded, render nothing.
  if (!data || data.total === 0) return null;

  // £ formatting — whole pounds, grouped. Defined inline to stay self-contained.
  const gbp = (n: number) => `£${Number(Math.round(n)).toLocaleString()}`;

  const status = data.countByStatus;
  const statusLine = [
    `${status.REQUESTED ?? 0} requested`,
    `${status.APPROVED ?? 0} approved`,
    `${status.IMPLEMENTED ?? 0} implemented`,
    `${status.REJECTED ?? 0} rejected`,
  ].join(" · ");

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Variations impact</h3>
      <p className="text-xs text-muted-foreground">
        Cost and programme impact of approved &amp; implemented plot variations
        across the portfolio.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{gbp(data.totalCostAdded)}</div>
          <div className="text-xs text-muted-foreground">Cost added</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">
            {Number(data.totalDaysAdded).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Days added</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">
            {Number(data.total).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Variations</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">
            {Number(data.pendingCount).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Awaiting approval</div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{statusLine}</p>

      {data.bySite.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="mb-1 text-xs font-medium text-slate-600">
            Top sites by variation cost
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left">Site</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Days</th>
                <th className="text-right">N</th>
              </tr>
            </thead>
            <tbody>
              {data.bySite.map((s) => (
                <tr key={s.siteName} className="border-t">
                  <td className="font-medium">{s.siteName}</td>
                  <td className="text-right">{gbp(s.cost)}</td>
                  <td className="text-right text-slate-500">
                    {Number(s.days).toLocaleString()}
                  </td>
                  <td className="text-right text-slate-500">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
