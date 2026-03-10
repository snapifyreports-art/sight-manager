"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
    assignedTo: { id: string; name: string } | null;
    orders: Array<{
      id: string;
      orderDetails: string | null;
      dateOfOrder: string;
      expectedDeliveryDate: string | null;
      deliveredDate: string | null;
      status: string;
      leadTimeDays: number | null;
      supplier: { id: string; name: string };
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

// ---------- Main Component ----------

export function PlotDetailClient({ plot }: { plot: PlotData }) {
  const router = useRouter();

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
          className="transition-colors hover:text-foreground"
        >
          Sites
        </Link>
        <ChevronRight className="size-3.5" />
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
      <Tabs defaultValue="gantt">
        <TabsList>
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
        </TabsList>

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
            <GanttChart jobs={plot.jobs} />
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
                          <span className="inline-flex items-center gap-1">
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
                        <span className="inline-flex items-center gap-1">
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
      </Tabs>
    </div>
  );
}
