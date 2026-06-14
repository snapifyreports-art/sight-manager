"use client";

import { useState, useEffect } from "react";

interface SupplierRow {
  id: string;
  name: string;
  orderCount: number;
  spend: number;
  onTimeRate: number | null;
  avgLeadDays: number | null;
  attributedDaysLate: number;
}

// On-time RAG colour: green >=90, amber >=70, red below; muted when null.
function onTimeClass(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

export function SupplierScorecardWidget() {
  const [items, setItems] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (Jun 2026 pattern sweep) Cancellation flag — avoids a setState
    // after unmount if the widget is torn down mid-fetch.
    let cancelled = false;
    fetch("/api/analytics/supplier-scorecard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.suppliers && !cancelled) setItems(d.suppliers);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (loading) return null;
  // Empty portfolio → render nothing so a fresh install stays clean.
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Supplier scorecard</h3>
      <p className="text-xs text-muted-foreground">
        Delivery reliability beyond spend — top suppliers by spend, with
        on-time rate, lead time, and attributed lateness.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left">Supplier</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Spend</th>
              <th className="text-right">On-time %</th>
              <th className="text-right">Avg lead (d)</th>
              <th className="text-right">Days late</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="font-medium">{s.name}</td>
                <td className="text-right text-slate-500">{s.orderCount}</td>
                <td className="text-right">
                  £{Number(s.spend).toLocaleString()}
                </td>
                <td className={`text-right font-semibold ${onTimeClass(s.onTimeRate)}`}>
                  {s.onTimeRate !== null ? `${s.onTimeRate}%` : "n/a"}
                </td>
                <td className="text-right text-slate-500">
                  {s.avgLeadDays !== null ? s.avgLeadDays : "n/a"}
                </td>
                <td className="text-right text-slate-500">
                  {s.attributedDaysLate > 0 ? (
                    <span className="font-semibold text-red-600">
                      {s.attributedDaysLate}
                    </span>
                  ) : (
                    0
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
