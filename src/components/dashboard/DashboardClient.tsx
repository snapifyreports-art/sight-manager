"use client";

import {
  Building2,
  Briefcase,
  ShoppingCart,
  Users,
  Clock,
  Activity,
  CircleDot,
  TrendingUp,
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
  activeJobs: number;
  pendingOrders: number;
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
  site: { name: string } | null;
  job: { name: string } | null;
}

interface TrafficLightJob {
  id: string;
  name: string;
  status: string;
  plot: { name: string; site: { name: string } };
  assignedTo: { name: string } | null;
}

export interface DashboardData {
  stats: StatsData;
  jobsByStatus: JobsByStatus;
  recentEvents: EventLogEntry[];
  trafficLightJobs: TrafficLightJob[];
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

function StatsCards({ stats }: { stats: StatsData }) {
  const cards = [
    {
      title: "Total Sites",
      value: stats.totalSites,
      icon: Building2,
      gradient: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-500/20",
      lightBg: "bg-blue-50",
    },
    {
      title: "Active Jobs",
      value: stats.activeJobs,
      icon: Briefcase,
      gradient: "from-emerald-500 to-emerald-600",
      shadow: "shadow-emerald-500/20",
      lightBg: "bg-emerald-50",
    },
    {
      title: "Pending Orders",
      value: stats.pendingOrders,
      icon: ShoppingCart,
      gradient: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
      lightBg: "bg-amber-50",
    },
    {
      title: "Total Contacts",
      value: stats.totalContacts,
      icon: Users,
      gradient: "from-violet-500 to-purple-600",
      shadow: "shadow-violet-500/20",
      lightBg: "bg-violet-50",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
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
      })}
    </div>
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
      <div className="flex flex-wrap gap-2.5">
        {statusOrder.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = jobsByStatus[status];
          return (
            <div
              key={status}
              className={`flex items-center gap-2 rounded-full border border-border/40 px-4 py-2 text-[13px] font-medium ${config.bgColor}`}
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
              <div
                key={job.id}
                className={`rounded-xl border border-border/40 border-l-[3px] bg-white p-4 shadow-sm transition-all hover:shadow-md ${config.borderColor}`}
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
              </div>
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
                      <span className="text-xs font-medium text-slate-500">
                        {event.job.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{event.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {event.user && <span className="font-medium">{event.user.name}</span>}
                    {event.site && (
                      <>
                        <span>&middot;</span>
                        <span>{event.site.name}</span>
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
          <span>{data.stats.activeJobs} active jobs</span>
        </div>
      </div>

      {/* Stats Row */}
      <StatsCards stats={data.stats} />

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
