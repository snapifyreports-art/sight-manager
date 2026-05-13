"use client";

import Link from "next/link";
import {
  Building2,
  Briefcase,
  ShoppingCart,
  Users,
  Clock,
  Activity,
  CircleDot,
  TrendingUp,
  Package,
  Truck,
  PackageCheck,
  Send,
  AlertTriangle,
  Bug,
  Star,
  MapPin,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  type PieLabelRenderProps,
} from "recharts";
import { formatDistanceToNow } from "date-fns";

// ---------- Types ----------

interface StatsData {
  totalSites: number;
  totalJobs: number;
  inProgressJobs: number;
  totalOrders: number;
  ordersToSend: number;
  awaitingDelivery: number;
  deliveredOrders: number;
  totalContacts: number;
}

interface JobsByStatus {
  NOT_STARTED: number;
  IN_PROGRESS: number;
  ON_HOLD: number;
  COMPLETED: number;
}

interface EventLogEntry {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { name: string } | null;
  site: { id: string; name: string } | null;
  job: { id: string; name: string } | null;
}

interface TrafficLightJob {
  id: string;
  name: string;
  status: string;
  plot: { name: string; site: { name: string } };
  assignedTo: { name: string } | null;
}

interface OverdueJob {
  id: string;
  name: string;
  endDate: string | null;
  /** Server-computed working-day lateness, anchored to dev-date-aware
   *  today. Pre-computed so the panel stays consistent with the
   *  Lateness SSOT (see audit D-P1-1). */
  daysLate: number;
  plot: {
    id: string;
    name: string;
    plotNumber: string | null;
    site: { id: string; name: string };
  };
}

interface StaleSnag {
  id: string;
  description: string;
  createdAt: string;
  /** Server-computed working-day age, anchored to dev-date-aware today. */
  daysOpen: number;
  priority: string;
  plot: {
    id: string;
    name: string;
    plotNumber: string | null;
    site: { id: string; name: string };
  };
}

interface WatchedSite {
  id: string;
  name: string;
  location: string | null;
  status: string;
  plotCount: number;
}

interface PlotOverBudget {
  id: string;
  name: string;
  plotNumber: string | null;
  siteId: string;
  siteName: string;
  budgeted: number;
  actual: number;
  overrun: number;
}

export interface DashboardData {
  stats: StatsData;
  jobsByStatus: JobsByStatus;
  recentEvents: EventLogEntry[];
  trafficLightJobs: TrafficLightJob[];
  overdueJobs: OverdueJob[];
  staleSnags: StaleSnag[];
  watchedSites: WatchedSite[];
  plotsOverBudget: PlotOverBudget[];
}

// ---------- Helpers ----------

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; borderColor: string; bgColor: string; dotColor: string }
> = {
  COMPLETED: {
    label: "Completed",
    color: "#22c55e",
    borderColor: "border-l-emerald-500",
    bgColor: "bg-emerald-50",
    dotColor: "text-emerald-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "#3b82f6",
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50",
    dotColor: "text-blue-500",
  },
  ON_HOLD: {
    label: "On Hold",
    color: "#f59e0b",
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-50",
    dotColor: "text-amber-500",
  },
  NOT_STARTED: {
    label: "Not Started",
    color: "#94a3b8",
    borderColor: "border-l-slate-300",
    bgColor: "bg-slate-50",
    dotColor: "text-slate-400",
  },
};

const EVENT_TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  JOB_STARTED: "default",
  JOB_COMPLETED: "default",
  JOB_STOPPED: "destructive",
  JOB_EDITED: "secondary",
  ORDER_PLACED: "outline",
  ORDER_DELIVERED: "default",
  ORDER_CANCELLED: "destructive",
  SITE_CREATED: "default",
  SITE_UPDATED: "secondary",
  PLOT_CREATED: "default",
  PLOT_UPDATED: "secondary",
  USER_ACTION: "secondary",
  NOTIFICATION: "outline",
  SYSTEM: "outline",
};

function formatEventType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------- Stats Cards ----------

// (May 2026 audit D-P1) Derived stats on top of the API output:
// atRiskCount (overdue job count), totalLatenessWdLost (sum of working-
// days late across all overdue jobs). Pre-fix the dashboard's 8 stat
// cards covered sites/jobs/orders/contacts but had NO entry-points for
// the director's first-of-the-day questions — "how much are we
// running late this morning?" and "which sites need a phone call?".
// Both numbers are visible in the At-Risk panel below the fold, but
// the cards are the above-the-fold scanning surface.
function StatsCards({
  stats,
  atRiskCount,
  totalLatenessWdLost,
}: {
  stats: StatsData;
  atRiskCount: number;
  totalLatenessWdLost: number;
}) {
  const cards = [
    {
      title: "Total Sites",
      value: stats.totalSites,
      icon: Building2,
      gradient: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-500/20",
      href: "/sites",
    },
    {
      // (May 2026 audit #143) Pre-fix Total Jobs + Jobs In Progress
      // were dead numbers — clicking them did nothing. Linking to
      // the cross-site Daily Brief is the closest "show me the jobs"
      // page we have today; it lists all sites' active work.
      title: "Total Jobs",
      value: stats.totalJobs,
      icon: Briefcase,
      gradient: "from-slate-500 to-slate-600",
      shadow: "shadow-slate-500/20",
      href: "/daily-brief" as string | null,
    },
    {
      title: "Jobs In Progress",
      value: stats.inProgressJobs,
      icon: Activity,
      gradient: "from-emerald-500 to-emerald-600",
      shadow: "shadow-emerald-500/20",
      href: "/daily-brief" as string | null,
    },
    {
      title: "Total Orders",
      value: stats.totalOrders,
      icon: Package,
      gradient: "from-indigo-500 to-indigo-600",
      shadow: "shadow-indigo-500/20",
      href: "/orders",
    },
    {
      title: "Future Orders",
      value: stats.ordersToSend,
      icon: Send,
      gradient: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
      href: "/orders?status=PENDING",
    },
    {
      title: "Awaiting Delivery",
      value: stats.awaitingDelivery,
      icon: Truck,
      gradient: "from-cyan-500 to-teal-500",
      shadow: "shadow-cyan-500/20",
      href: "/orders?status=ORDERED",
    },
    {
      title: "Delivered",
      value: stats.deliveredOrders,
      icon: PackageCheck,
      gradient: "from-green-500 to-green-600",
      shadow: "shadow-green-500/20",
      href: "/orders?status=DELIVERED",
    },
    {
      title: "Total Contacts",
      value: stats.totalContacts,
      icon: Users,
      gradient: "from-violet-500 to-purple-600",
      shadow: "shadow-violet-500/20",
      href: "/contacts",
    },
    // (May 2026 audit D-P1) Director's morning scan questions. The
    // numbers themselves are above-the-fold; the deep-link drops the
    // user into the At-Risk anchor of the same page, or jumps to
    // Analytics → Lateness for the working-day total.
    {
      title: "At-Risk Jobs",
      value: atRiskCount,
      icon: AlertTriangle,
      gradient:
        atRiskCount > 0
          ? "from-red-500 to-red-600"
          : "from-slate-300 to-slate-400",
      shadow: atRiskCount > 0 ? "shadow-red-500/20" : "shadow-slate-300/20",
      href: "#at-risk" as string | null,
    },
    {
      title: "Working Days Late",
      value: totalLatenessWdLost,
      icon: Clock,
      gradient:
        totalLatenessWdLost > 0
          ? "from-amber-500 to-orange-500"
          : "from-slate-300 to-slate-400",
      shadow:
        totalLatenessWdLost > 0
          ? "shadow-amber-500/20"
          : "shadow-slate-300/20",
      href: "/analytics" as string | null,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const inner = (
          <div
            className="group relative overflow-hidden rounded-xl border border-border/50 bg-white p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-medium text-slate-500">{card.title}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                  {card.value}
                </p>
              </div>
              <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} shadow-md ${card.shadow}`}>
                <Icon className="size-5 text-white" />
              </div>
            </div>
            {/* Subtle bottom accent */}
            <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${card.gradient} opacity-40`} />
          </div>
        );
        return card.href ? (
          <Link key={card.title} href={card.href} className="hover:opacity-80 transition-opacity">
            {inner}
          </Link>
        ) : (
          <div key={card.title}>{inner}</div>
        );
      })}
    </div>
  );
}

// ---------- Muted Sites Panel ----------
//
// (#183) IMPORTANT — semantic flip:
//
//   Prisma model name : WatchedSite (legacy — can't change without migration)
//   Component name    : WatchedSitesPanel (legacy — keeping for diff cleanliness)
//   Variable name     : sites / watchedSites
//
//   ACTUAL semantic   : these are sites the user has explicitly MUTED.
//
// Default is "subscribed to every site you have access to" (May 2026
// flip — pre-fix users had to opt-IN to receive any notifications,
// resulting in silent no-deliveries). A WatchedSite row now means
// "user has opted OUT of this site's pushes". The panel renders
// only those exceptions so the user can quickly unmute if they
// over-muted.
//
// (May 2026 audit SM-P1) Future maintainers: do NOT add "watch"
// behavior here without first migrating the Prisma model name.
// Search for "muted" first to find every consumer that reads the
// row as "opt-out".

function WatchedSitesPanel({ sites }: { sites: WatchedSite[] }) {
  if (sites.length === 0) {
    // No mutes — dashboard stays calm.
    return null;
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Star
            className="size-4 fill-slate-300 text-slate-500"
            aria-hidden="true"
          />
          <CardTitle className="text-base">Muted sites</CardTitle>
          <span className="text-sm font-normal text-muted-foreground">
            ({sites.length})
          </span>
        </div>
        <CardDescription className="text-xs">
          Notifications are off for these sites. Click any to unmute.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((s) => (
          <Link
            key={s.id}
            href={`/sites/${s.id}`}
            className="rounded-lg border bg-white p-3 text-xs ring-amber-100 transition hover:ring-2 hover:ring-amber-300"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-slate-900">
                {s.name}
              </p>
              {s.status === "ON_HOLD" && (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  On hold
                </span>
              )}
              {s.status === "COMPLETED" && (
                <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Complete
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
              {s.location && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="size-3" aria-hidden="true" />
                  {s.location}
                </span>
              )}
              <span>
                {s.plotCount} plot{s.plotCount !== 1 ? "s" : ""}
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- At-Risk Panel ----------
//
// (May 2026 audit #46) Surface things the manager should look at now.
// Two columns: overdue jobs (endDate passed) + stale snags (open
// >30d). Renders nothing when both lists are empty so the dashboard
// stays calm when nothing's burning.

function AtRiskPanel({
  overdueJobs,
  staleSnags,
}: {
  overdueJobs: OverdueJob[];
  staleSnags: StaleSnag[];
}) {
  if (overdueJobs.length === 0 && staleSnags.length === 0) return null;

  // (May 2026 audit D-P1-1) `daysLate` / `daysOpen` are now pre-computed
  // server-side using working-day arithmetic. The old client-side
  // `dayCount` returned calendar days off `Date.now()` (browser clock
  // + ignored dev-date), which disagreed with the Lateness SSOT
  // headline ("6 working days lost" in LatenessSummary vs "8d late"
  // in the panel — same job).

  return (
    // (May 2026 audit D-P1) Anchor id so the "At-Risk Jobs" stat card
    // above can deep-link straight to this panel.
    <Card id="at-risk" className="scroll-mt-24 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
          <CardTitle className="text-base text-amber-900">At-Risk</CardTitle>
        </div>
        <CardDescription className="text-xs text-amber-800">
          Things slipping. Click any row to drill into the plot.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {overdueJobs.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <Clock className="size-3.5" aria-hidden="true" />
              Overdue jobs ({overdueJobs.length})
            </p>
            <ul className="space-y-1.5">
              {overdueJobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/sites/${j.plot.site.id}/plots/${j.plot.id}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-amber-100 hover:ring-amber-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name} · {j.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {j.plot.site.name}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {j.daysLate} WD late
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {staleSnags.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <Bug className="size-3.5" aria-hidden="true" />
              Stale snags &gt;30d ({staleSnags.length})
            </p>
            <ul className="space-y-1.5">
              {staleSnags.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sites/${s.plot.site.id}?tab=snags`}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-amber-100 hover:ring-amber-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {s.description}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {s.plot.plotNumber ? `Plot ${s.plot.plotNumber}` : s.plot.name} · {s.plot.site.name}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {s.daysOpen} WD open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Traffic Light System ----------

function TrafficLightSection({
  jobsByStatus,
  trafficLightJobs,
}: {
  jobsByStatus: JobsByStatus;
  trafficLightJobs: TrafficLightJob[];
}) {
  const statusOrder: Array<keyof JobsByStatus> = [
    "COMPLETED",
    "IN_PROGRESS",
    "ON_HOLD",
    "NOT_STARTED",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100">
          <Activity className="size-4 text-slate-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Job Health Overview</h2>
          <p className="text-xs text-slate-500">Real-time status across all sites</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2.5">
        {statusOrder.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = jobsByStatus[status];
          return (
            <div
              key={status}
              className={`flex items-center gap-1.5 rounded-full border border-border/40 px-2.5 py-1.5 text-[11px] font-medium sm:gap-2 sm:px-4 sm:py-2 sm:text-[13px] ${config.bgColor}`}
            >
              <CircleDot className={`size-3.5 ${config.dotColor}`} />
              <span className="text-slate-700">
                {config.label}: <span className="font-semibold">{count}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Job cards grid */}
      {trafficLightJobs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trafficLightJobs.map((job) => {
            const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.NOT_STARTED;
            return (
              <Link
                href={`/jobs/${job.id}`}
                key={job.id}
                className={`block rounded-xl border border-border/40 border-l-[3px] bg-white p-4 shadow-sm transition-all hover:shadow-md cursor-pointer ${config.borderColor}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{job.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {job.plot.site.name} &bull; {job.plot.name}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.bgColor}`}>
                    <CircleDot className={`size-2.5 ${config.dotColor}`} />
                    <span className="text-slate-600">{config.label}</span>
                  </div>
                </div>
                {job.assignedTo && (
                  <p className="mt-3 text-xs text-slate-400">
                    Assigned to <span className="font-medium text-slate-500">{job.assignedTo.name}</span>
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-slate-50/50 py-10 text-center">
          <p className="text-sm text-slate-400">No active jobs to display.</p>
        </div>
      )}
    </div>
  );
}

// ---------- Job Status Chart ----------

function JobStatusChart({ jobsByStatus }: { jobsByStatus: JobsByStatus }) {
  const pieData = [
    { name: "Completed", value: jobsByStatus.COMPLETED, color: STATUS_CONFIG.COMPLETED.color },
    { name: "In Progress", value: jobsByStatus.IN_PROGRESS, color: STATUS_CONFIG.IN_PROGRESS.color },
    { name: "On Hold", value: jobsByStatus.ON_HOLD, color: STATUS_CONFIG.ON_HOLD.color },
    { name: "Not Started", value: jobsByStatus.NOT_STARTED, color: STATUS_CONFIG.NOT_STARTED.color },
  ];

  const barData = pieData.map((d) => ({ name: d.name, Jobs: d.value }));
  const total = pieData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Pie Chart */}
      <div className="rounded-xl border border-border/50 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Status Distribution</h3>
          <p className="text-xs text-slate-500">Breakdown of all jobs by current status</p>
        </div>
        {total === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
            No job data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
                label={(props: PieLabelRenderProps) =>
                  `${props.name ?? ""} ${(Number(props.percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fff",
                  color: "#1e293b",
                  fontSize: "13px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bar Chart */}
      <div className="rounded-xl border border-border/50 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Jobs by Status</h3>
          <p className="text-xs text-slate-500">Comparative view of job statuses</p>
        </div>
        {total === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
            No job data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barCategoryGap="20%">
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fff",
                  color: "#1e293b",
                  fontSize: "13px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Legend />
              <Bar dataKey="Jobs" radius={[8, 8, 0, 0]}>
                {barData.map((_, index) => (
                  <Cell key={index} fill={pieData[index].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---------- Recent Activity ----------

function RecentActivity({ events }: { events: EventLogEntry[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-white shadow-sm">
      <div className="border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100">
            <Clock className="size-4 text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
            <p className="text-xs text-slate-500">Latest events across all sites and jobs</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-2">
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No recent activity.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 py-4"
              >
                {/* Timeline dot */}
                <div className="mt-2 flex flex-col items-center">
                  <div className="size-2 rounded-full bg-blue-500 ring-4 ring-blue-500/10" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={EVENT_TYPE_VARIANT[event.type] ?? "outline"}>
                      {formatEventType(event.type)}
                    </Badge>
                    {event.job && (
                      <Link href={`/jobs/${event.job.id}`} className="text-xs font-medium text-blue-600 hover:underline">
                        {event.job.name}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-sm text-slate-700 sm:line-clamp-none">{event.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {event.user && <span className="hidden font-medium sm:inline">{event.user.name}</span>}
                    {event.site && (
                      <>
                        <span className="hidden sm:inline">&middot;</span>
                        <Link href={`/sites/${event.site.id}`} className="hidden sm:inline hover:underline hover:text-blue-600">
                          {event.site.name}
                        </Link>
                      </>
                    )}
                    <span>&middot;</span>
                    <span>
                      {formatDistanceToNow(new Date(event.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main Dashboard Client ----------

export function DashboardClient({ data }: { data: DashboardData }) {
  // (May 2026 audit O-P0) Zero-sites onboarding state. Pre-fix a
  // first-time user landed on the dashboard, saw 8 stat cards full of
  // zeroes, an empty traffic-light grid, and an empty pie chart. The
  // natural first action — "Create your first site" — was two clicks
  // away on a page they had no reason to visit. Now: if there are
  // zero sites total, replace the entire stat/widget grid with a
  // welcome card that walks the user through the 3-step setup.
  if (data.stats.totalSites === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome to Sight Manager
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Let&apos;s get your first site set up.
          </p>
        </div>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-6 sm:p-8">
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
                >
                  1
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Create a site</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Sites are projects with plots, jobs, and a timeline.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-300 text-sm font-bold text-white"
                >
                  2
                </span>
                <div>
                  <p className="font-semibold text-slate-900">Add plots</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Each plot represents a home or unit you&apos;re building.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-200 text-sm font-bold text-blue-900"
                >
                  3
                </span>
                <div>
                  <p className="font-semibold text-slate-900">
                    Apply a template
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Templates seed the standard build stages, durations,
                    and materials — you can edit anything.
                  </p>
                </div>
              </li>
            </ol>
            <div className="mt-6">
              <Link
                href="/sites?new=1"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition-all hover:shadow-lg"
              >
                <Building2 className="size-4" />
                Create your first site
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Overview of your construction site operations
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-[13px] font-medium text-blue-700 sm:flex">
          <TrendingUp className="size-4" />
          <span>{data.stats.inProgressJobs} in progress</span>
        </div>
      </div>

      {/* Stats Row */}
      <StatsCards
        stats={data.stats}
        atRiskCount={data.overdueJobs.length}
        totalLatenessWdLost={data.overdueJobs.reduce(
          (sum, j) => sum + (j.daysLate ?? 0),
          0,
        )}
      />

      {/* (May 2026 audit follow-up to #152) Sites the user is watching
          — surfaces what's on their personal radar without trawling
          the full /sites list. */}
      <WatchedSitesPanel sites={data.watchedSites} />

      {/* (May 2026 audit #46) At-Risk panel surfaces things the
          manager should worry about right now: overdue jobs (end
          date passed, not COMPLETED) and stale snags (open >30 days).
          Hidden when there's nothing to show — no noise in calm weeks. */}
      <AtRiskPanel overdueJobs={data.overdueJobs} staleSnags={data.staleSnags} />

      {/* (May 2026 audit #168) Plots over budget. Hidden when none. */}
      {data.plotsOverBudget.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-rose-600" aria-hidden />
              <CardTitle className="text-base text-rose-900">
                Plots over budget
              </CardTitle>
              <span className="text-xs font-normal text-rose-700">
                ({data.plotsOverBudget.length})
              </span>
            </div>
            <CardDescription className="text-xs text-rose-800">
              Delivered materials cost is already over the planned budget.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {data.plotsOverBudget.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/sites/${p.siteId}/plots/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-rose-100 hover:ring-rose-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {p.plotNumber ? `Plot ${p.plotNumber}` : p.name} ·{" "}
                        <span className="text-slate-500">{p.siteName}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        £{p.actual.toLocaleString("en-GB")} actual / £
                        {p.budgeted.toLocaleString("en-GB")} budgeted
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      +£{p.overrun.toLocaleString("en-GB")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Traffic Light System */}
      <TrafficLightSection
        jobsByStatus={data.jobsByStatus}
        trafficLightJobs={data.trafficLightJobs}
      />

      {/* Charts */}
      <JobStatusChart jobsByStatus={data.jobsByStatus} />

      {/* Recent Activity */}
      <RecentActivity events={data.recentEvents} />
    </div>
  );
}
