"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useDevDate } from "@/lib/dev-date-context";
import { ReportExportButtons } from "@/components/shared/ReportExportButtons";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";
import {
  Loader2,
  Building2,
  Briefcase,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Truck,
  Users,
  BarChart3,
  CloudRain,
} from "lucide-react";
import { fetchErrorMessage } from "@/components/ui/toast";

// ---------- Types ----------

interface SiteProgress {
  siteId: string;
  siteName: string;
  status: string;
  totalPlots: number;
  totalJobs: number;
  completedJobs: number;
  avgBuildPercent: number;
  delayedJobs: number;
  onTrack: boolean;
}

interface JobDuration {
  jobName: string;
  avgPlannedDays: number;
  avgActualDays: number | null;
  count: number;
}

interface ContractorPerf {
  id: string;
  name: string;
  totalJobs: number;
  completedJobs: number;
  onTimeJobs: number;
  // (May 2026 audit D-P1) Jobs marked COMPLETED without actualEndDate
  // are not measurable for on-time-ness. Tracked separately by the
  // API so the on-time-rate denominator excludes them.
  unknownOutcomeJobs: number;
  measurableJobs: number;
  onTimeRate: number | null;
  avgDelayDays: number;
}

interface OrderMetrics {
  ordersByStatus: Record<string, number>;
  totalSpend: number;
  avgLeadTimeDays: number | null;
  onTimeDeliveryRate: number | null;
  totalOrders: number;
  supplierSpend: Array<{ name: string; spend: number; orderCount: number }>;
}

interface AnalyticsData {
  siteProgress: SiteProgress[];
  jobStatusSummary: Record<string, number>;
  jobDurations: JobDuration[];
  contractorPerformance: ContractorPerf[];
  orderMetrics: OrderMetrics;
  activityTimeline: Array<{ date: string; count: number }>;
  summary: {
    totalSites: number;
    totalPlots: number;
    totalJobs: number;
    totalOrders: number;
    totalSpend: number;
  };
  rainedOffStats?: {
    totalDays: number;
    rainDays: number;
    temperatureDays: number;
    totalJobsAffected: number;
    bySite: Array<{ siteId: string; siteName: string; days: number }>;
  };
}

// ---------- Colors ----------

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  ON_HOLD: "#f59e0b",
  COMPLETED: "#22c55e",
};

const ORDER_COLORS: Record<string, string> = {
  PENDING: "#94a3b8",
  ORDERED: "#3b82f6",
  DELIVERED: "#22c55e",
  CANCELLED: "#ef4444",
};

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

// ---------- Helpers ----------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-500/5 text-blue-700",
    green: "from-green-500/10 to-green-500/5 text-green-700",
    amber: "from-amber-500/10 to-amber-500/5 text-amber-700",
    red: "from-red-500/10 to-red-500/5 text-red-700",
    purple: "from-purple-500/10 to-purple-500/5 text-purple-700",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-500",
    green: "text-green-500",
    amber: "text-amber-500",
    red: "text-red-500",
    purple: "text-purple-500",
  };

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-4 ${colorClasses[color] || colorClasses.blue}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {sub && (
            <p className="mt-0.5 text-[11px] opacity-60">{sub}</p>
          )}
        </div>
        <Icon className={`size-8 opacity-40 ${iconColors[color] || ""}`} />
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Building2;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function RAGBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    value >= 80
      ? "bg-green-100 text-green-700"
      : value >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {value}%
    </span>
  );
}

// ---------- Component ----------

export function AnalyticsClient() {
  const { devDate } = useDevDate();
  const searchParams = useSearchParams();
  const siteFilter = searchParams.get("site") ?? "";
  const reqKey = `${siteFilter}|${devDate ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; data: AnalyticsData | null; error: string | null } | null>(null);
  const data = loaded?.key === reqKey ? loaded.data : null;
  const loading = loaded?.key !== reqKey;
  const error = loaded?.key === reqKey ? loaded.error : null;

  useEffect(() => {
    let cancelled = false;
    const url = siteFilter
      ? `/api/analytics?siteId=${siteFilter}`
      : "/api/analytics";
    (async () => {
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to load analytics");
          setLoaded({ key: reqKey, data: null, error: msg });
          return;
        }
        const d = await res.json();
        if (!cancelled) setLoaded({ key: reqKey, data: d, error: null });
      } catch (e) {
        if (!cancelled) setLoaded({ key: reqKey, data: null, error: e instanceof Error ? e.message : "Network error" });
      }
    })();
    return () => { cancelled = true; };
  }, [siteFilter, devDate, reqKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Failed to load analytics</p>
        <p className="text-xs">{error}</p>
        <button onClick={() => setLoaded(null)} className="mt-2 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Failed to load analytics data.
      </p>
    );
  }

  const jobStatusData = Object.entries(data.jobStatusSummary).map(
    ([status, count]) => ({
      name: status.replace("_", " "),
      value: count,
      fill: STATUS_COLORS[status] || "#94a3b8",
    })
  );

  const orderStatusData = Object.entries(data.orderMetrics.ordersByStatus).map(
    ([status, count]) => ({
      name: status,
      value: count,
      fill: ORDER_COLORS[status] || "#94a3b8",
    })
  );

  // Flatten summary + contractor performance + site progress + supplier spend
  // into separate sheets conceptually, but ReportExportButtons writes one
  // sheet — so we emit the contractor performance table as the main data
  // (most useful for board reporting).
  const exportRows = data.contractorPerformance.map((c) => ({
    Contractor: c.name,
    "Total Jobs": c.totalJobs,
    "Completed Jobs": c.completedJobs,
    "On-Time Jobs": c.onTimeJobs,
    "On-Time Rate %": c.onTimeRate ?? "",
    "Avg Delay (days)": c.avgDelayDays,
  }));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Analytics" },
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Performance insights across your sites and teams
          </p>
        </div>
        <ReportExportButtons
          filename={`analytics-${format(new Date(), "yyyy-MM-dd")}`}
          rows={exportRows}
          sheetName="Contractor Performance"
          compact
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={Building2}
          label="Sites"
          value={data.summary.totalSites}
          sub={`${data.summary.totalPlots} plots`}
          color="blue"
        />
        <StatCard
          icon={Briefcase}
          label="Total Jobs"
          value={data.summary.totalJobs}
          sub={`${data.jobStatusSummary.COMPLETED || 0} completed`}
          color="green"
        />
        <StatCard
          icon={ShoppingCart}
          label="Orders"
          value={data.summary.totalOrders}
          sub={`${data.orderMetrics.ordersByStatus.DELIVERED || 0} delivered`}
          color="purple"
        />
        <StatCard
          icon={DollarSign}
          label="Total Spend"
          value={formatCurrency(data.summary.totalSpend)}
          color="amber"
        />
        <StatCard
          icon={Truck}
          label="On-Time Delivery"
          value={
            data.orderMetrics.onTimeDeliveryRate !== null
              ? `${data.orderMetrics.onTimeDeliveryRate}%`
              : "—"
          }
          sub={
            data.orderMetrics.avgLeadTimeDays !== null
              ? `Avg ${data.orderMetrics.avgLeadTimeDays}d lead time`
              : undefined
          }
          color={
            data.orderMetrics.onTimeDeliveryRate !== null &&
            data.orderMetrics.onTimeDeliveryRate >= 80
              ? "green"
              : "red"
          }
        />
        {data.rainedOffStats && (
          <StatCard
            icon={CloudRain}
            label="Weather Impact Days"
            value={data.rainedOffStats.totalDays}
            sub={[
              data.rainedOffStats.rainDays > 0 ? `☔ ${data.rainedOffStats.rainDays} rain` : null,
              data.rainedOffStats.temperatureDays > 0 ? `🌡️ ${data.rainedOffStats.temperatureDays} temp` : null,
              data.rainedOffStats.totalJobsAffected > 0
                ? `${data.rainedOffStats.totalJobsAffected} jobs noted`
                : null,
            ].filter(Boolean).join(" · ") || "No weather impact days recorded"}
            color="orange"
          />
        )}
      </div>

      {/* Row 1: Site Progress + Job Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Site Progress */}
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <SectionHeader icon={Building2} title="Site Progress" />
          {data.siteProgress.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sites found.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {data.siteProgress.map((site) => {
                const completedPct = site.totalJobs > 0
                  ? Math.round((site.completedJobs / site.totalJobs) * 100)
                  : 0;
                const inProgressPct = site.totalJobs > 0
                  ? Math.round(((site.totalJobs - site.completedJobs - site.delayedJobs) / site.totalJobs) * 100)
                  : 0;
                const delayedPct = site.totalJobs > 0
                  ? Math.round((site.delayedJobs / site.totalJobs) * 100)
                  : 0;

                return (
                  <div key={site.siteId} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/sites/${site.siteId}`} className="text-sm font-semibold hover:text-blue-600 hover:underline">{site.siteName}</Link>
                        {site.onTrack ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            <CheckCircle2 className="size-2.5" />
                            On Track
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            <AlertTriangle className="size-2.5" />
                            Delayed
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {site.completedJobs}/{site.totalJobs} jobs
                      </span>
                    </div>
                    {/* Stacked progress bar */}
                    <div className="h-6 w-full overflow-hidden rounded-lg bg-slate-100 flex">
                      {completedPct > 0 && (
                        <div
                          className="h-full bg-green-500 flex items-center justify-center transition-all"
                          style={{ width: `${completedPct}%` }}
                        >
                          {completedPct >= 10 && (
                            <span className="text-[10px] font-bold text-white">{completedPct}%</span>
                          )}
                        </div>
                      )}
                      {delayedPct > 0 && (
                        <div
                          className="h-full bg-red-400 flex items-center justify-center transition-all"
                          style={{ width: `${delayedPct}%` }}
                        >
                          {delayedPct >= 8 && (
                            <span className="text-[10px] font-bold text-white">{delayedPct}%</span>
                          )}
                        </div>
                      )}
                      <div className="h-full flex-1" />
                    </div>
                    {/* Stats row */}
                    <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
                      <span>{site.totalPlots} plots</span>
                      <span className="text-green-600">{site.completedJobs} complete</span>
                      {site.delayedJobs > 0 && (
                        <span className="text-red-500">{site.delayedJobs} delayed</span>
                      )}
                      <span className="ml-auto font-medium text-foreground">
                        {site.avgBuildPercent}% built
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Legend */}
              <div className="flex items-center gap-4 pt-2 border-t text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-sm bg-green-500" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-sm bg-red-400" />
                  <span>Delayed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-sm bg-slate-100" />
                  <span>Remaining</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Job Status Donut */}
        <div className="rounded-xl border bg-white p-4">
          <SectionHeader icon={Briefcase} title="Job Status" />
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={jobStatusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {jobStatusData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => [String(value ?? ""), "Jobs"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {jobStatusData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="capitalize">{item.name.toLowerCase()}</span>
                </div>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Job Durations (planned vs actual) */}
      {data.jobDurations.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <SectionHeader icon={Clock} title="Job Durations — Planned vs Actual" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data.jobDurations}
              margin={{ top: 10, right: 10, left: 0, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="jobName"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: "Days",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value, name) => [
                  `${value ?? 0} days`,
                  name === "avgPlannedDays" ? "Planned" : "Actual",
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) =>
                  value === "avgPlannedDays" ? "Planned (avg)" : "Actual (avg)"
                }
              />
              <Bar
                dataKey="avgPlannedDays"
                fill="#93c5fd"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="avgActualDays"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 3: Contractor Performance + Order Status */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Contractor Performance */}
        <div className="rounded-xl border bg-white p-4">
          <SectionHeader icon={Users} title="Contractor Performance" />
          {data.contractorPerformance.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No contractor data yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Contractor</th>
                    <th className="pb-2 text-center font-medium">Jobs</th>
                    <th className="pb-2 text-center font-medium">Done</th>
                    <th className="pb-2 text-center font-medium">On-Time</th>
                    <th className="pb-2 text-center font-medium">
                      Avg Delay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.contractorPerformance.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link href={`/contacts/${c.id}`} className="hover:text-blue-600 hover:underline">{c.name}</Link>
                      </td>
                      <td className="py-2 text-center">{c.totalJobs}</td>
                      <td className="py-2 text-center">
                        {c.completedJobs}
                        {c.unknownOutcomeJobs > 0 && (
                          <span
                            className="ml-1 text-[10px] text-amber-600"
                            title={`${c.unknownOutcomeJobs} completed without a recorded end date — excluded from on-time rate (May 2026 audit D-P1)`}
                          >
                            (-{c.unknownOutcomeJobs})
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {c.measurableJobs > 0 ? (
                          <RAGBadge value={c.onTimeRate} />
                        ) : (
                          <span className="text-muted-foreground" title="No completed jobs with recorded end dates">n/a</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {c.avgDelayDays > 0 ? (
                          <span className="text-red-600">
                            +{c.avgDelayDays}d
                          </span>
                        ) : (
                          <span className="text-green-600">0d</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order Status */}
        <div className="rounded-xl border bg-white p-4">
          <SectionHeader icon={ShoppingCart} title="Order Status" />
          <div className="flex gap-6">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={orderStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {orderStatusData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value) => [String(value ?? ""), "Orders"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center space-y-1.5">
              {orderStatusData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <div
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="w-16 capitalize">
                    {item.name.toLowerCase()}
                  </span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Key metrics */}
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Total Spend</p>
              <p className="text-sm font-bold">
                {formatCurrency(data.orderMetrics.totalSpend)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Avg Lead Time</p>
              <p className="text-sm font-bold">
                {data.orderMetrics.avgLeadTimeDays !== null
                  ? `${data.orderMetrics.avgLeadTimeDays}d`
                  : "—"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">On-Time %</p>
              <p className="text-sm font-bold">
                {data.orderMetrics.onTimeDeliveryRate !== null
                  ? `${data.orderMetrics.onTimeDeliveryRate}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Supplier Spend + Activity Timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Supplier Spend */}
        {data.orderMetrics.supplierSpend.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <SectionHeader icon={DollarSign} title="Spend by Supplier" />
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={data.orderMetrics.supplierSpend}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value) => [
                    formatCurrency(Number(value ?? 0)),
                    "Spend",
                  ]}
                />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {data.orderMetrics.supplierSpend.map((_, index) => (
                    <Cell
                      key={index}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Activity Timeline */}
        {data.activityTimeline.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <SectionHeader icon={TrendingUp} title="Activity (Last 30 Days)" />
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart
                data={data.activityTimeline}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatShortDate}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(label) => formatShortDate(String(label ?? ""))}
                  formatter={(value) => [String(value ?? ""), "Events"]}
                />
                <defs>
                  <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#activityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* (May 2026 audit #180 + #182 + #183) Derived analytics
          widgets pulled from the dedicated endpoints. */}
      <StageBenchmarkWidget />
      <DelayTrendsWidget />
      <WeatherLossWidget />
      {/* (May 2026 audit #167 + #52) */}
      <ProfitabilityWidget />
      <ContractorCalendarWidget />
      {/* (#191) Cross-site lateness rollup. */}
      <LatenessWidget />
    </div>
  );
}

// ────────── Stage benchmarking ──────────────────────────────────────────

interface StageStat {
  stage: string;
  sample: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
}

function StageBenchmarkWidget() {
  const [items, setItems] = useState<StageStat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/analytics/stage-benchmark")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) setItems(d.items);
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return null;
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Stage benchmark</h3>
      <p className="text-xs text-muted-foreground">
        Actual durations from every completed leaf job, grouped by stage.
        Longest mean at the top.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left">Stage</th>
              <th className="text-right">Mean (d)</th>
              <th className="text-right">Median</th>
              <th className="text-right">p10</th>
              <th className="text-right">p90</th>
              <th className="text-right">N</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 15).map((s) => (
              <tr key={s.stage} className="border-t">
                <td className="font-medium">{s.stage}</td>
                <td className="text-right">{s.mean}</td>
                <td className="text-right">{s.median}</td>
                <td className="text-right text-slate-500">{s.p10}</td>
                <td className="text-right text-slate-500">{s.p90}</td>
                <td className="text-right text-slate-500">{s.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────── Delay trends ────────────────────────────────────────────────

interface DelaySeriesItem {
  weekStart: string;
  total: number;
  reasons: Record<string, number>;
}

function DelayTrendsWidget() {
  const [data, setData] = useState<{
    series: DelaySeriesItem[];
    topReasons: Array<{ reason: string; count: number }>;
  } | null>(null);
  useEffect(() => {
    fetch("/api/analytics/delay-trends")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);
  if (!data) return null;
  const max = Math.max(1, ...data.series.map((s) => s.total));
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Delay trends (last 12 weeks)</h3>
      <p className="text-xs text-muted-foreground">
        Cascade events per week. Top reasons:{" "}
        {data.topReasons.slice(0, 3).map((r) => `${r.reason} (${r.count})`).join(", ") || "no delays"}
      </p>
      <div className="mt-3 flex h-32 items-end gap-1">
        {data.series.map((s) => {
          const pct = (s.total / max) * 100;
          return (
            <div key={s.weekStart} className="flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t bg-amber-400"
                style={{ height: `${pct}%`, minHeight: s.total > 0 ? 2 : 0 }}
                title={`${s.weekStart}: ${s.total}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────── Weather loss ────────────────────────────────────────────────

interface WeatherLoss {
  totalDays: number;
  byType: Record<string, number>;
  bySite: Array<{ id: string; name: string; days: number }>;
}

function WeatherLossWidget() {
  const [data, setData] = useState<WeatherLoss | null>(null);
  useEffect(() => {
    fetch("/api/analytics/weather-loss")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);
  if (!data || data.totalDays === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Weather loss</h3>
      <p className="text-xs text-muted-foreground">
        Total {data.totalDays} weather days recorded across all sites.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-slate-700">By type</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {Object.entries(data.byType).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}</span>: {v} days
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-700">Most affected sites</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {data.bySite.slice(0, 5).map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.name}</span>: {s.days} days
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ────────── Profitability ──────────────────────────────────────────────

interface ProfRow {
  plotId: string;
  plotName: string;
  plotNumber: string | null;
  siteName: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

function ProfitabilityWidget() {
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [totals, setTotals] = useState<{ revenue: number; cost: number; profit: number } | null>(null);
  useEffect(() => {
    fetch("/api/analytics/profitability")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setRows(d.rows);
          setTotals(d.totals);
        }
      });
  }, []);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Per-plot profitability</h3>
      {totals && (
        <p className="text-xs text-muted-foreground">
          Total revenue £{totals.revenue.toLocaleString("en-GB")} · cost £
          {totals.cost.toLocaleString("en-GB")} · profit £
          {totals.profit.toLocaleString("en-GB")}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left">Plot</th>
              <th className="text-left">Site</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Profit</th>
              <th className="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((r) => (
              <tr key={r.plotId} className="border-t">
                <td className="font-medium">
                  {r.plotNumber ? `Plot ${r.plotNumber}` : r.plotName}
                </td>
                <td className="text-xs text-slate-600">{r.siteName}</td>
                <td className="text-right text-xs">
                  £{r.revenue.toLocaleString("en-GB")}
                </td>
                <td className="text-right text-xs">
                  £{r.cost.toLocaleString("en-GB")}
                </td>
                <td
                  className={`text-right font-semibold ${r.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}
                >
                  £{r.profit.toLocaleString("en-GB")}
                </td>
                <td className="text-right text-xs">{r.marginPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────── Contractor calendar ────────────────────────────────────────

interface ContractorRow {
  contactId: string;
  name: string;
  company: string | null;
  jobs: Array<{
    jobId: string;
    jobName: string;
    start: string;
    end: string;
    plotLabel: string;
    siteName: string;
  }>;
}

function ContractorCalendarWidget() {
  const [data, setData] = useState<ContractorRow[]>([]);
  useEffect(() => {
    fetch("/api/analytics/contractor-calendar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.contractors) setData(d.contractors);
      });
  }, []);
  if (data.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Contractor schedule (next 8 weeks)</h3>
      <p className="text-xs text-muted-foreground">
        Each row is one contractor; their assigned jobs in the window are
        listed in start-date order.
      </p>
      <div className="mt-3 max-h-96 overflow-y-auto">
        <ul className="divide-y">
          {data.map((c) => (
            <li key={c.contactId} className="py-2">
              <p className="text-sm font-medium">
                {c.company || c.name}{" "}
                {c.company && <span className="text-xs text-slate-500">· {c.name}</span>}
              </p>
              <ul className="ml-3 mt-1 space-y-0.5 text-xs text-slate-600">
                {c.jobs.map((j) => (
                  <li key={j.jobId}>
                    <span className="font-medium text-slate-800">
                      {j.plotLabel}
                    </span>{" "}
                    · {j.jobName} ·{" "}
                    {new Date(j.start).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    →{" "}
                    {new Date(j.end).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ────────── Cross-site lateness widget ──────────────────────────────────

interface LatenessAnalytics {
  byReason: Array<{ reason: string; openDays: number; resolvedDays: number; count: number }>;
  bySite: Array<{ siteId: string; siteName: string; openCount: number; openDays: number; resolvedCount: number; resolvedDays: number }>;
  byContractor: Array<{ contactId: string; name: string; company: string | null; count: number; days: number }>;
  // (May 2026 audit S-P1) Supplier attribution parallel to contractor.
  // Order-driven lateness is auto-attributed to the order's supplier
  // by the cron, so this section is meaningful day one.
  bySupplier?: Array<{ supplierId: string; name: string; count: number; days: number }>;
  totals: { openCount: number; openDays: number; resolvedCount: number; resolvedDays: number };
}

const REASON_DISPLAY: Record<string, string> = {
  WEATHER_RAIN: "Weather (rain)",
  WEATHER_TEMPERATURE: "Weather (temperature)",
  WEATHER_WIND: "Weather (wind)",
  MATERIAL_LATE: "Material — late",
  MATERIAL_WRONG: "Material — wrong",
  MATERIAL_SHORT: "Material — short",
  LABOUR_NO_SHOW: "Labour — no-show",
  LABOUR_SHORT: "Labour — short-staffed",
  DESIGN_CHANGE: "Design change",
  SPEC_CLARIFICATION: "Spec clarification",
  PREDECESSOR_LATE: "Predecessor late",
  ACCESS_BLOCKED: "Access blocked",
  INSPECTION_FAILED: "Inspection failed",
  OTHER: "Not attributed",
};

function LatenessWidget() {
  const [data, setData] = useState<LatenessAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/analytics/lateness", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto size-5 animate-spin" />
      </div>
    );
  }
  if (!data || (data.totals.openCount === 0 && data.totals.resolvedCount === 0)) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold">Lateness</h3>
        <span className="text-xs text-muted-foreground">
          {data.totals.openDays + data.totals.resolvedDays} WD lost across {data.totals.openCount + data.totals.resolvedCount} events
        </span>
      </div>
      <div className="space-y-4">
        {/* By reason */}
        {data.byReason.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Working days lost by reason
            </p>
            <ul className="space-y-1.5">
              {data.byReason.slice(0, 10).map((r) => {
                const total = r.openDays + r.resolvedDays;
                const maxTotal = data.byReason[0].openDays + data.byReason[0].resolvedDays;
                const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                return (
                  <li key={r.reason} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{REASON_DISPLAY[r.reason] ?? r.reason}</span>
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-slate-700">{total}</span> WD · {r.count} event{r.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-red-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* By site */}
        {data.bySite.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sites by lateness
            </p>
            <ul className="divide-y divide-slate-100 rounded-md border">
              {data.bySite.slice(0, 8).map((s) => (
                <li key={s.siteId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <Link href={`/sites/${s.siteId}`} className="font-medium text-blue-600 hover:underline">
                    {s.siteName}
                  </Link>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-slate-700">{s.openDays}</span> open · {s.resolvedDays} resolved · {s.openCount + s.resolvedCount} events
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* By contractor */}
        {data.byContractor.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lateness attributed to contractor
            </p>
            <ul className="divide-y divide-slate-100 rounded-md border">
              {data.byContractor.map((c) => (
                <li key={c.contactId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <Link href={`/contacts/${c.contactId}`} className="font-medium text-blue-600 hover:underline">
                    {c.company || c.name}
                  </Link>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-slate-700">{c.days}</span> WD · {c.count} event{c.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* (May 2026 audit S-P1) By supplier — auto-populated by the
            lateness cron for every late delivery. */}
        {data.bySupplier && data.bySupplier.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lateness attributed to supplier
            </p>
            <ul className="divide-y divide-slate-100 rounded-md border">
              {data.bySupplier.map((s) => (
                <li key={s.supplierId} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <Link href={`/suppliers/${s.supplierId}`} className="font-medium text-orange-700 hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-slate-700">{s.days}</span> WD · {s.count} event{s.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
