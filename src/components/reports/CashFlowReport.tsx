"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  TrendingUp,
  DollarSign,
  BarChart3,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchErrorMessage } from "@/components/ui/toast";
import { ReportExportButtons } from "@/components/shared/ReportExportButtons";
import { format } from "date-fns";

interface MonthData {
  month: string;
  committed: number;
  forecast: number;
  actual: number;
  cumulativeCommitted: number;
  cumulativeForecast: number;
  cumulativeActual: number;
}

interface CashFlowData {
  months: MonthData[];
  totals: {
    committed: number;
    forecast: number;
    actual: number;
  };
}

const fmt = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
}

type DateMode = "current" | "original";

export function CashFlowReport({ siteId }: { siteId: string }) {
  const [dateMode, setDateMode] = useState<DateMode>("current");
  // Tag fetched data with the request key so loading is derivable.
  const requestKey = `${siteId}|${dateMode}`;
  const [loaded, setLoaded] = useState<{ key: string; data: CashFlowData | null; error: string | null } | null>(null);
  const data = loaded?.key === requestKey ? loaded.data : null;
  const loading = loaded?.key !== requestKey;
  const error = loaded?.key === requestKey ? loaded.error : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/cash-flow?dateMode=${dateMode}`);
        if (cancelled) return;
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to load cash flow");
          setLoaded({ key: requestKey, data: null, error: msg });
          return;
        }
        const d = await res.json();
        if (!cancelled) setLoaded({ key: requestKey, data: d, error: null });
      } catch (e) {
        if (!cancelled) setLoaded({ key: requestKey, data: null, error: e instanceof Error ? e.message : "Network error" });
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, dateMode, requestKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Failed to load cash flow</p>
        <p className="text-xs">{error}</p>
        <button onClick={() => setLoaded(null)} className="mt-2 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data || data.months.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No cash flow data yet — place some material orders to see spend
            tracking.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.months.map((m) => ({
    name: formatMonth(m.month),
    Actual: m.cumulativeActual,
    Committed: m.cumulativeCommitted,
    Forecast: m.cumulativeForecast,
  }));

  // Monthly rows for Excel — one row per month with the key figures.
  const exportRows = data.months.map((m) => ({
    Month: formatMonth(m.month),
    Committed: m.committed,
    Forecast: m.forecast,
    Actual: m.actual,
    "Cumulative Committed": m.cumulativeCommitted,
    "Cumulative Forecast": m.cumulativeForecast,
    "Cumulative Actual": m.cumulativeActual,
  }));

  return (
    <div className="space-y-4">
      {/* Date mode toggle + exports */}
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <button
            onClick={() => setDateMode("current")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              dateMode === "current"
                ? "bg-slate-900 text-white"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Current
          </button>
          <button
            onClick={() => setDateMode("original")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              dateMode === "original"
                ? "bg-slate-900 text-white"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Original
          </button>
        </div>
        {dateMode === "original" && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="size-3" />
            <span>
              Estimated from job original dates — orders don&apos;t track
              original dates directly
            </span>
          </div>
        )}
      </div>
        <ReportExportButtons
          filename={`cashflow-${format(new Date(), "yyyy-MM-dd")}`}
          rows={exportRows}
          sheetName="Cash Flow"
          compact
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <DollarSign className="size-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Committed</p>
              <p className="text-lg font-semibold">
                {fmt.format(data.totals.committed)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <TrendingUp className="size-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actual Delivered</p>
              <p className="text-lg font-semibold">
                {fmt.format(data.totals.actual)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-slate-500/10 p-2">
              <Clock className="size-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Forecast (Pending)</p>
              <p className="text-lg font-semibold">
                {fmt.format(data.totals.forecast)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cumulative Spend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(value) => fmt.format(Number(value))}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Actual"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Committed"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Forecast"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Month</th>
                  <th className="pb-2 pr-4 text-right">Committed</th>
                  <th className="pb-2 pr-4 text-right">Actual</th>
                  <th className="pb-2 text-right">Forecast</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.months.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium">
                      {formatMonth(m.month)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {m.committed > 0 ? fmt.format(m.committed) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {m.actual > 0 ? fmt.format(m.actual) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {m.forecast > 0 ? fmt.format(m.forecast) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="pt-2 pr-4">Total</td>
                  <td className="pt-2 pr-4 text-right">
                    {fmt.format(data.totals.committed)}
                  </td>
                  <td className="pt-2 pr-4 text-right">
                    {fmt.format(data.totals.actual)}
                  </td>
                  <td className="pt-2 text-right">
                    {fmt.format(data.totals.forecast)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
