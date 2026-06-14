"use client";

import { useEffect, useState } from "react";

// (Jun 2026) Materials burn-down widget. Mirrors StageBenchmarkWidget's
// fetch/loading/empty conventions exactly. delivered/consumed are keyed in
// manually per plot, so an empty install renders nothing.

interface OverSuppliedRow {
  name: string;
  unit: string;
  delivered: number;
  consumed: number;
  surplus: number;
}

interface CategoryRow {
  category: string;
  expected: number;
  delivered: number;
  consumed: number;
}

interface MaterialsData {
  totals: { expected: number; delivered: number; consumed: number };
  overallConsumedPctOfDelivered: number | null;
  topOverSupplied: OverSuppliedRow[];
  byCategory: CategoryRow[];
}

// Inline money/number formatter — quantities aren't currency but read better
// with thousands separators (e.g. "12,500 bricks").
const fmt = (x: number) => Number(x).toLocaleString();

export function MaterialsWidget() {
  const [data, setData] = useState<MaterialsData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (May 2026 pattern sweep) Cancellation flag — avoids a setState
    // after unmount if the widget is torn down mid-fetch.
    let cancelled = false;
    fetch("/api/analytics/materials")
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
  // Render nothing on an empty portfolio (no materials tracked anywhere).
  if (
    !data ||
    (data.totals.expected === 0 &&
      data.totals.delivered === 0 &&
      data.totals.consumed === 0)
  ) {
    return null;
  }

  const { totals, overallConsumedPctOfDelivered, topOverSupplied, byCategory } =
    data;

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Materials burn-down</h3>
      <p className="text-xs text-muted-foreground">
        Expected vs delivered vs consumed across every plot. Delivered and
        consumed figures are maintained manually per plot.
      </p>

      {/* Headline tiles. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(totals.expected)}</div>
          <div className="text-xs text-muted-foreground">Expected</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(totals.delivered)}</div>
          <div className="text-xs text-muted-foreground">Delivered</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">{fmt(totals.consumed)}</div>
          <div className="text-xs text-muted-foreground">Consumed</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-xl font-bold">
            {overallConsumedPctOfDelivered === null
              ? "—"
              : `${overallConsumedPctOfDelivered}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            Consumed % of delivered
          </div>
        </div>
      </div>

      {/* Over-supplied materials. */}
      {topOverSupplied.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium">
            Most over-supplied (delivered minus consumed)
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left">Material</th>
                  <th className="text-right">Delivered</th>
                  <th className="text-right">Consumed</th>
                  <th className="text-right">Surplus</th>
                </tr>
              </thead>
              <tbody>
                {topOverSupplied.map((m) => (
                  <tr key={m.name} className="border-t">
                    <td className="font-medium">{m.name}</td>
                    <td className="text-right">
                      {fmt(m.delivered)}{" "}
                      <span className="text-slate-400">{m.unit}</span>
                    </td>
                    <td className="text-right">{fmt(m.consumed)}</td>
                    <td className="text-right font-medium text-amber-600">
                      {fmt(m.surplus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By-category mini-table. */}
      {byCategory.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium">By category</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left">Category</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Delivered</th>
                  <th className="text-right">Consumed</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="font-medium">{c.category}</td>
                    <td className="text-right text-slate-500">
                      {fmt(c.expected)}
                    </td>
                    <td className="text-right">{fmt(c.delivered)}</td>
                    <td className="text-right">{fmt(c.consumed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
