"use client";

import {
  GitBranch,
  Briefcase,
  ShoppingCart,
  Users,
  Clock,
  Activity,
  CircleDot,
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
  totalWorkflows: number;
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
  workflow: { name: string } | null;
  job: { name: string } | null;
}

interface TrafficLightJob {
  id: string;
  name: string;
  status: string;
  siteName: string | null;
  plot: string | null;
  workflow: { name: string };
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
    borderColor: "border-l-green-500",
    bgColor: "bg-green-500/10",
    dotColor: "text-green-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "#f59e0b",
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-500/10",
    dotColor: "text-amber-500",
  },
  ON_HOLD: {
    label: "On Hold",
    color: "#ef4444",
    borderColor: "border-l-red-500",
    bgColor: "bg-red-500/10",
    dotColor: "text-red-500",
  },
  NOT_STARTED: {
    label: "Not Started",
    color: "#94a3b8",
    borderColor: "border-l-slate-400",
    bgColor: "bg-slate-400/10",
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
  WORKFLOW_CREATED: "default",
  WORKFLOW_UPDATED: "secondary",
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
      title: "Total Workflows",
      value: stats.totalWorkflows,
      icon: GitBranch,
      accent: "text-chart-1",
      bg: "bg-chart-1/10",
    },
    {
      title: "Active Jobs",
      value: stats.activeJobs,
      icon: Briefcase,
      accent: "text-chart-2",
      bg: "bg-chart-2/10",
    },
    {
      title: "Pending Orders",
      value: stats.pendingOrders,
      icon: ShoppingCart,
      accent: "text-chart-3",
      bg: "bg-chart-3/10",
    },
    {
      title: "Total Contacts",
      value: stats.totalContacts,
      icon: Users,
      accent: "text-chart-4",
      bg: "bg-chart-4/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription className="text-sm font-medium">
                {card.title}
              </CardDescription>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <Icon className={`size-4 ${card.accent}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{card.value}</div>
            </CardContent>
          </Card>
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
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Job Health Overview</h2>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        {statusOrder.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = jobsByStatus[status];
          return (
            <div
              key={status}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${config.bgColor}`}
            >
              <CircleDot className={`size-3.5 ${config.dotColor}`} />
              <span>
                {config.label}: {count}
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
              <Card
                key={job.id}
                className={`border-l-4 ${config.borderColor}`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{job.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {job.workflow.name}
                        {job.siteName ? ` \u2022 ${job.siteName}` : ""}
                        {job.plot ? ` \u2022 Plot ${job.plot}` : ""}
                      </p>
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor}`}>
                      <CircleDot className={`size-2.5 ${config.dotColor}`} />
                      <span>{config.label}</span>
                    </div>
                  </div>
                  {job.assignedTo && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Assigned to {job.assignedTo.name}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active jobs to display.
          </CardContent>
        </Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
          <CardDescription>Breakdown of all jobs by current status</CardDescription>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              No job data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
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
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs by Status</CardTitle>
          <CardDescription>Comparative view of job statuses</CardDescription>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              No job data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} barCategoryGap="20%">
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Legend />
                <Bar dataKey="Jobs" radius={[6, 6, 0, 0]}>
                  {barData.map((_, index) => (
                    <Cell key={index} fill={pieData[index].color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Recent Activity ----------

function RecentActivity({ events }: { events: EventLogEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <CardTitle>Recent Activity</CardTitle>
        </div>
        <CardDescription>Latest events across all workflows and jobs</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No recent activity.
          </p>
        ) : (
          <div className="space-y-0">
            {events.map((event, index) => (
              <div
                key={event.id}
                className={`flex items-start gap-3 py-3 ${
                  index !== events.length - 1 ? "border-b" : ""
                }`}
              >
                {/* Timeline dot */}
                <div className="mt-1.5 flex flex-col items-center">
                  <div className="size-2 rounded-full bg-primary" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={EVENT_TYPE_VARIANT[event.type] ?? "outline"}>
                      {formatEventType(event.type)}
                    </Badge>
                    {event.job && (
                      <span className="text-xs text-muted-foreground">
                        {event.job.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{event.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {event.user && <span>by {event.user.name}</span>}
                    {event.workflow && (
                      <>
                        <span className="text-border">&middot;</span>
                        <span>{event.workflow.name}</span>
                      </>
                    )}
                    <span className="text-border">&middot;</span>
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
      </CardContent>
    </Card>
  );
}

// ---------- Main Dashboard Client ----------

export function DashboardClient({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your construction site operations
        </p>
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
