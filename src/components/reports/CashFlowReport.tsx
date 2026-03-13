"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  TrendingUp,
  DollarSign,
  BarChart3,
  Clock,
} from "lucide-react";
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

export function CashFlowReport({ siteId }: { siteId: string }) {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/cash-flow`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
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

  return (
    <div className="space-y-4">
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
