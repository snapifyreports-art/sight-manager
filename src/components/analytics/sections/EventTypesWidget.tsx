"use client";

import { useEffect, useState } from "react";

// (Jun 2026) Activity-by-event-type widget. Reads the 90-day EventLog
// rollup from /api/analytics/event-types and renders the top types as a
// labelled horizontal-bar table. Self-contained: no chart lib, no shared
// helpers — the enum humaniser lives inline below.

interface EventTypeStat {
  type: string;
  count: number;
}

interface EventTypeData {
  total: number;
  byType: EventTypeStat[];
  windowDays: number;
}

// Humanise an EventType enum value: "INSPECTION_PASSED" -> "Inspection passed".
// First word Title Case, the rest lower so it reads like a sentence label.
function humanise(type: string): string {
  const words = type.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return type;
  return words
    .map((w, i) =>
      i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    )
    .join(" ");
}

export function EventTypesWidget() {
  const [data, setData] = useState<EventTypeData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (Jun 2026 pattern sweep) Cancellation flag — avoid setState after unmount.
    let cancelled = false;
    fetch("/api/analytics/event-types")
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
  // Empty portfolio (fresh install / no events in window) renders nothing.
  if (!data || data.byType.length === 0 || data.total === 0) return null;

  const top = data.byType.slice(0, 15);
  const max = Math.max(1, ...top.map((t) => t.count));

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Activity by type (last 90 days)</h3>
      <p className="text-xs text-muted-foreground">
        Every logged event in the last {data.windowDays} days, grouped by
        type. Busiest first.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left">Event type</th>
              <th className="w-1/2 text-left">Share</th>
              <th className="text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t) => {
              const pct = (t.count / max) * 100;
              return (
                <tr key={t.type} className="border-t">
                  <td className="py-1 font-medium">{humanise(t.type)}</td>
                  <td className="py-1">
                    <div className="h-2 w-full rounded bg-slate-100">
                      <div
                        className="h-2 rounded bg-sky-400"
                        style={{ width: `${pct}%`, minWidth: 2 }}
                      />
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {Number(t.count).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {Number(data.total).toLocaleString()} event
        {data.total !== 1 ? "s" : ""} across {data.byType.length} type
        {data.byType.length !== 1 ? "s" : ""} in the last {data.windowDays}{" "}
        days.
      </p>
    </div>
  );
}
