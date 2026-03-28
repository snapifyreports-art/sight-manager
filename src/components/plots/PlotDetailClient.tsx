"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, differenceInCalendarDays } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  ChevronRight,
  Plus,
  Briefcase,
  CalendarDays,
  User,
  ShoppingCart,
  CircleDot,
  BarChart3,
  ListChecks,
  List,
  LayoutDashboard,
  Clock,
  FileCheck,
  AlertTriangle,
  Package,
  CheckCircle2,
  Play,
  Pause,
  TrendingUp,
  Truck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GanttChart } from "@/components/gantt/GanttChart";
import { PlotTodoList } from "@/components/plots/PlotTodoList";
import { PlotHistoryTab } from "@/components/plots/PlotHistoryTab";
import { HandoverChecklist } from "@/components/handover/HandoverChecklist";

// ---------- Types ----------

interface PlotData {
  id: string;
  name: string;
  description: string | null;
  site: { id: string; name: string };
  jobs: Array<{
    id: string;
    name: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    status: string;
    parentId: string | null;
    parentStage: string | null;
    sortOrder: number;
    assignedTo: { id: string; name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null } | null;
    }>;
    orders: Array<{
      id: string;
      orderDetails: string | null;
      itemsDescription: string | null;
      dateOfOrder: string;
      expectedDeliveryDate: string | null;
      deliveredDate: string | null;
      status: string;
      leadTimeDays: number | null;
      supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null };
      orderItems: Array<{
        id: string;
        name: string;
        quantity: number;
        unit: string;
        unitCost: number;
        totalCost: number;
      }>;
    }>;
  }>;
}

// ---------- Status Config ----------

const JOB_STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; dotColor: string }
> = {
  NOT_STARTED: {
    label: "Not Started",
    bgColor: "bg-slate-400/10",
    dotColor: "text-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    bgColor: "bg-amber-500/10",
    dotColor: "text-amber-500",
  },
  ON_HOLD: {
    label: "On Hold",
    bgColor: "bg-red-500/10",
    dotColor: "text-red-500",
  },
  COMPLETED: {
    label: "Completed",
    bgColor: "bg-green-500/10",
    dotColor: "text-green-500",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] ?? JOB_STATUS_CONFIG.NOT_STARTED;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor}`}
    >
      <CircleDot className={`size-3 ${config.dotColor}`} />
      <span>{config.label}</span>
    </div>
  );
}

// ---------- Add Job Dialog ----------

function AddJobDialog({
  plotId,
  onCreated,
}: {
  plotId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function resetForm() {
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });

      if (res.ok) {
        resetForm();
        setOpen(false);
        onCreated();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" data-icon="inline-start" />
            Add Job
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Job</DialogTitle>
          <DialogDescription>
            Create a new job for this plot. You can add orders and materials
            later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-name">Name</Label>
            <Input
              id="job-name"
              placeholder="e.g. First Fix Plumbing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-description">Description</Label>
            <Textarea
              id="job-description"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="job-start-date">Start Date</Label>
              <Input
                id="job-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-end-date">End Date</Label>
              <Input
                id="job-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create Job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Overview Tab ----------

function PlotOverview({
  plot,
  snagSummary,
}: {
  plot: PlotData;
  snagSummary: Record<string, number>;
}) {
  const today = getCurrentDate();
  const router = useRouter();
  const [pendingOrderActions, setPendingOrderActions] = useState<Set<string>>(new Set());

  async function handleOrderStatus(orderId: string, status: string) {
    setPendingOrderActions((prev) => new Set(prev).add(orderId));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setPendingOrderActions((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  }

  const stats = useMemo(() => {
    const allJobs = plot.jobs;
    const total = allJobs.length;
    const completed = allJobs.filter((j) => j.status === "COMPLETED").length;
    const inProgress = allJobs.filter((j) => j.status === "IN_PROGRESS").length;
    const onHold = allJobs.filter((j) => j.status === "ON_HOLD").length;
    const notStarted = allJobs.filter((j) => j.status === "NOT_STARTED").length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const allOrders = allJobs.flatMap((j) => j.orders);
    const pendingOrders = allOrders.filter(
      (o) => o.status === "PENDING" || o.status === "ORDERED"
    );
    const upcomingDeliveries = allOrders.filter((o) => {
      if (!o.expectedDeliveryDate || o.deliveredDate) return false;
      const days = differenceInCalendarDays(
        new Date(o.expectedDeliveryDate),
        today
      );
      return days >= 0 && days <= 14;
    });
    const overdueDeliveries = allOrders.filter((o) => {
      if (!o.expectedDeliveryDate || o.deliveredDate) return false;
      return differenceInCalendarDays(new Date(o.expectedDeliveryDate), today) < 0;
    });

    const openSnags =
      (snagSummary["OPEN"] || 0) + (snagSummary["IN_PROGRESS"] || 0);

    return {
      total,
      completed,
      inProgress,
      onHold,
      notStarted,
      progressPercent,
      pendingOrders,
      upcomingDeliveries,
      overdueDeliveries,
      openSnags,
    };
  }, [plot.jobs, snagSummary, today]);

  // Group jobs by parent stage
  const stageGroups = useMemo(() => {
    const groups: Record<
      string,
      { name: string; jobs: typeof plot.jobs }
    > = {};
    for (const job of plot.jobs) {
      const stage = job.parentStage || "Ungrouped";
      if (!groups[stage]) {
        groups[stage] = { name: stage, jobs: [] };
      }
      groups[stage].jobs.push(job);
    }
    return Object.values(groups);
  }, [plot.jobs]);

  const activeJobs = useMemo(
    () => plot.jobs.filter((j) => j.status === "IN_PROGRESS"),
    [plot.jobs]
  );

  return (
    <div className="space-y-6">
      {/* Progress Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.progressPercent}%</p>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-green-500 transition-all"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Play className="size-4 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.inProgress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="size-4 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.openSnags}</p>
                <p className="text-xs text-muted-foreground">Open Snags</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10">
                <Package className="size-4 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingOrders.length}</p>
                <p className="text-xs text-muted-foreground">Pending Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Jobs by Stage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Jobs by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {stageGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet</p>
            ) : (
              <div className="space-y-3">
                {stageGroups.map((group) => {
                  const completed = group.jobs.filter(
                    (j) => j.status === "COMPLETED"
                  ).length;
                  const pct =
                    group.jobs.length > 0
                      ? Math.round((completed / group.jobs.length) * 100)
                      : 0;

                  return (
                    <div key={group.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {completed}/{group.jobs.length} done
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-green-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex gap-1">
                          {group.jobs.map((job) => {
                            const cfg =
                              JOB_STATUS_CONFIG[job.status] ??
                              JOB_STATUS_CONFIG.NOT_STARTED;
                            return (
                              <div
                                key={job.id}
                                title={`${job.name} — ${cfg.label}`}
                                className={`size-2 rounded-full ${cfg.dotColor.replace("text-", "bg-")}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Work */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Work</CardTitle>
          </CardHeader>
          <CardContent>
            {activeJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No jobs currently in progress
              </p>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((job) => {
                  const contractor = job.contractors?.[0]?.contact;
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {job.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                            {(job.assignedTo || contractor) && (
                              <span className="inline-flex items-center gap-1">
                                <User className="size-3" />
                                {job.assignedTo?.name ||
                                  (contractor?.company
                                    ? `${contractor.company}`
                                    : contractor?.name)}
                              </span>
                            )}
                            {job.endDate && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="size-3" />
                                Due {format(new Date(job.endDate), "d MMM")}
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deliveries & Snags row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming / Overdue Deliveries */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.overdueDeliveries.length === 0 &&
            stats.upcomingDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming deliveries
              </p>
            ) : (
              <div className="space-y-2">
                {stats.overdueDeliveries.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {order.supplier.name}
                      </p>
                      <p className="text-xs text-red-600">
                        Overdue —{" "}
                        {format(new Date(order.expectedDeliveryDate!), "d MMM")}
                      </p>
                    </div>
                    {pendingOrderActions.has(order.id) ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="outline" size="sm"
                        className="h-6 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                        onClick={() => handleOrderStatus(order.id, "DELIVERED")}>
                        <CheckCircle2 className="mr-1 size-2.5" />Received
                      </Button>
                    )}
                  </div>
                ))}
                {stats.upcomingDeliveries.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {order.supplier.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due{" "}
                        {format(new Date(order.expectedDeliveryDate!), "d MMM")}
                      </p>
                    </div>
                    {pendingOrderActions.has(order.id) ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="outline" size="sm"
                        className="h-6 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                        onClick={() => handleOrderStatus(order.id, "DELIVERED")}>
                        <CheckCircle2 className="mr-1 size-2.5" />Received
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Snag Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Snags</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.openSnags === 0 &&
            !snagSummary["RESOLVED"] &&
            !snagSummary["CLOSED"] ? (
              <p className="text-sm text-muted-foreground">
                No snags raised on this plot
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Open",
                    count: snagSummary["OPEN"] || 0,
                    color: "text-red-500",
                    bg: "bg-red-500/10",
                  },
                  {
                    label: "In Progress",
                    count: snagSummary["IN_PROGRESS"] || 0,
                    color: "text-amber-500",
                    bg: "bg-amber-500/10",
                  },
                  {
                    label: "Resolved",
                    count: snagSummary["RESOLVED"] || 0,
                    color: "text-green-500",
                    bg: "bg-green-500/10",
                  },
                  {
                    label: "Closed",
                    count: snagSummary["CLOSED"] || 0,
                    color: "text-slate-500",
                    bg: "bg-slate-500/10",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-lg p-3 ${item.bg}`}
                  >
                    <p className={`text-xl font-bold ${item.color}`}>
                      {item.count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export function PlotDetailClient({
  plot,
  snagSummary = {},
}: {
  plot: PlotData;
  snagSummary?: Record<string, number>;
}) {
  const router = useRouter();
  const { devDate } = useDevDate();

  const jobsWithDates = plot.jobs.filter(
    (j) => j.startDate !== null || j.endDate !== null
  );

  function handleJobCreated() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          href="/dashboard"
          className="hidden transition-colors hover:text-foreground sm:inline"
        >
          Sites
        </Link>
        <ChevronRight className="hidden size-3.5 sm:inline" />
        <Link
          href={`/sites/${plot.site.id}`}
          className="transition-colors hover:text-foreground"
        >
          {plot.site.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{plot.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{plot.name}</h1>
            {plot.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {plot.description}
              </p>
            )}
          </div>
        </div>

        <AddJobDialog plotId={plot.id} onCreated={handleJobCreated} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="gantt">
            <BarChart3 className="size-4" />
            Gantt Chart
          </TabsTrigger>
          <TabsTrigger value="todo">
            <ListChecks className="size-4" />
            To-Do List
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <List className="size-4" />
            Jobs List
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="size-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="handover">
            <FileCheck className="size-4" />
            Handover
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <PlotOverview plot={plot} snagSummary={snagSummary} />
        </TabsContent>

        {/* Gantt Chart Tab */}
        <TabsContent value="gantt">
          {jobsWithDates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <BarChart3 className="size-10 text-muted-foreground/40" />
                <h3 className="mt-3 text-sm font-medium">No scheduled jobs</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add start and end dates to your jobs to see them on the Gantt
                  chart.
                </p>
              </CardContent>
            </Card>
          ) : (
            <GanttChart key={devDate ?? "live"} jobs={plot.jobs} />
          )}
        </TabsContent>

        {/* To-Do List Tab */}
        <TabsContent value="todo">
          <PlotTodoList jobs={plot.jobs} />
        </TabsContent>

        {/* Jobs List Tab */}
        <TabsContent value="jobs">
          {plot.jobs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Briefcase className="size-10 text-muted-foreground/40" />
                <h3 className="mt-3 text-sm font-medium">No jobs yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create your first job to start tracking work on this plot.
                </p>
                <div className="mt-4">
                  <AddJobDialog
                    plotId={plot.id}
                    onCreated={handleJobCreated}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {plot.jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block transition-colors"
                >
                  <Card className="transition-shadow hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate">
                            {job.name}
                          </CardTitle>
                          {job.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {job.description}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        {job.assignedTo && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" />
                            {job.assignedTo.name}
                          </span>
                        )}
                        {(job.startDate || job.endDate) && (
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <CalendarDays className="size-3" />
                            {job.startDate
                              ? format(new Date(job.startDate), "dd MMM")
                              : "?"}
                            {" - "}
                            {job.endDate
                              ? format(new Date(job.endDate), "dd MMM yyyy")
                              : "?"}
                          </span>
                        )}
                        <span className="hidden items-center gap-1 sm:inline-flex">
                          <ShoppingCart className="size-3" />
                          {job.orders.length} order
                          {job.orders.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}

              <div className="pt-2">
                <AddJobDialog plotId={plot.id} onCreated={handleJobCreated} />
              </div>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <PlotHistoryTab plotId={plot.id} />
        </TabsContent>

        <TabsContent value="handover">
          <HandoverChecklist plotId={plot.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
