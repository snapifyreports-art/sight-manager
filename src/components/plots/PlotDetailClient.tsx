"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, differenceInCalendarDays } from "date-fns";
import { getCurrentStage } from "@/lib/plot-stage";
import { getCurrentDateAtMidnight } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Briefcase,
  CalendarDays,
  User,
  ShoppingCart,
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
  Share2,
  Copy,
  Check,
  HardHat,
  Heart,
  PoundSterling,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useJobAction } from "@/hooks/useJobAction";
import { useOrderStatus, type OrderStatus } from "@/hooks/useOrderStatus";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardCheck } from "lucide-react";
import { PlotQualityPanel } from "@/components/plots/PlotQualityPanel";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";
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
import { PlotMaterialsSection } from "@/components/plots/PlotMaterialsSection";
import { PlotDrawingsSection } from "@/components/plots/PlotDrawingsSection";
import { PlotCustomerViewTab } from "@/components/plots/PlotCustomerViewTab";
import { JobStatusBadge, JOB_STATUS_CONFIG } from "@/components/shared/StatusBadge";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

// ---------- Types ----------

interface PlotData {
  id: string;
  name: string;
  description: string | null;
  plotNumber: string | null;
  // (May 2026 Keith request) House value — target build cost + GDV.
  buildBudget: number | null;
  salePrice: number | null;
  site: { id: string; name: string };
  jobs: Array<{
    id: string;
    name: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    originalStartDate: string | null;
    originalEndDate: string | null;
    status: string;
    parentId: string | null;
    parentStage: string | null;
    sortOrder: number;
    signedOffAt: string | null;
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

// Status badge moved to @/components/shared/StatusBadge — single source of
// truth so a job that's IN_PROGRESS looks identical on the plot page, job
// detail page, contractor sheet, and everywhere else.

// ---------- Add Job Dialog ----------

function AddJobDialog({
  plotId,
  onCreated,
}: {
  plotId: string;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateError, setDateError] = useState("");

  function resetForm() {
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setDateError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (startDate && endDate && endDate < startDate) {
      setDateError("End date cannot be before start date.");
      return;
    }
    setDateError("");

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

      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to create job"));
        return;
      }
      resetForm();
      setOpen(false);
      onCreated();
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
            <Label htmlFor="job-name">
              Name <span className="text-red-600" aria-hidden>*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <Input
              id="job-name"
              placeholder="e.g. First Fix Plumbing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              aria-required="true"
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

          <div className="space-y-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="job-start-date">Start Date</Label>
                <Input
                  id="job-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setDateError(""); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-end-date">End Date</Label>
                <Input
                  id="job-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setDateError(""); }}
                />
              </div>
            </div>
            {dateError && (
              <p className="text-xs text-red-600">{dateError}</p>
            )}
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
  // Midnight-snap so SSR + hydration agree on today's date (prevents React #418).
  const today = getCurrentDateAtMidnight();
  const router = useRouter();
  const [pendingJobActions, setPendingJobActions] = useState<Set<string>>(new Set());

  // Post-completion dialog state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [completionContext, setCompletionContext] = useState<any>(null);

  // Force full page refresh after data-changing actions
  const forceRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Centralised pre-start / early-start flow
  const { triggerAction: triggerJobAction, runSimpleAction, isLoading: jobActionLoading, dialogs: jobActionDialogs } = useJobAction(
    (_action, _jobId) => { forceRefresh(); }
  );

  const { setOrderStatus, isPending: isOrderPending } = useOrderStatus({
    onChange: () => forceRefresh(),
  });

  function handleOrderStatus(orderId: string, status: OrderStatus) {
    void setOrderStatus(orderId, status);
  }

  async function handleJobAction(jobId: string, action: "start" | "complete") {
    const jobData = plot.jobs.find((j) => j.id === jobId);
    if (action === "start" && jobData) {
      await triggerJobAction(
        {
          id: jobData.id,
          name: jobData.name,
          status: jobData.status,
          startDate: jobData.startDate,
          endDate: jobData.endDate,
          orders: jobData.orders.map((o) => ({ id: o.id, status: o.status, supplier: o.supplier })),
        },
        "start"
      );
      return;
    }
    setPendingJobActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await runSimpleAction(jobId, action);
      if (res.ok) {
        const result = res.data as { _completionContext?: unknown } | undefined;
        forceRefresh();
        // Show post-completion dialog if context returned
        if (result?._completionContext) {
          const jobName = plot.jobs.find((j) => j.id === jobId)?.name || "";
          setCompletionContext({ completedJobName: jobName, ...(result._completionContext as object) });
        }
      }
    } finally {
      setPendingJobActions((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
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
      if (o.deliveredDate) return false; // already received
      if (o.status === "PENDING") return false; // not sent yet
      if (!o.expectedDeliveryDate) return false;
      return differenceInCalendarDays(new Date(o.expectedDeliveryDate), today) >= 0;
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
  const jobs = plot.jobs;
  const stageGroups = useMemo(() => {
    const groups: Record<
      string,
      { name: string; jobs: typeof jobs }
    > = {};
    // Skip real parent Jobs (they're derived rollups) — identify them as jobs
    // that appear as parentId on other jobs. We group by parentStage for children
    // and by name for flat top-level jobs (no parent AND no children).
    //
    // Atomic top-level jobs (no parentId, no children) don't carry a
    // parentStage — their OWN name is the stage name. Falling back to
    // "Ungrouped" (old behaviour) lumped them all under one row, hiding
    // the actual stage structure. Smoke test Apr 2026 caught this on the
    // Flat Conversion template which has Strip-out + Refurbishment as
    // two atomic top-level stages.
    const parentJobIds = new Set(jobs.filter((j) => j.parentId).map((j) => j.parentId!));
    for (const job of jobs) {
      if (parentJobIds.has(job.id)) continue; // skip real parent Jobs
      // Preference order:
      //   1. parentStage — set when this job is a child of a proper stage
      //   2. job.name    — atomic top-level job IS its own stage
      //   3. "Ungrouped" — genuinely orphaned (shouldn't normally happen)
      const stage = job.parentStage || job.name || "Ungrouped";
      if (!groups[stage]) {
        groups[stage] = { name: stage, jobs: [] };
      }
      groups[stage].jobs.push(job);
    }
    return Object.values(groups);
  }, [jobs]);

  const activeJobs = useMemo(
    () => plot.jobs.filter((j) => j.status === "IN_PROGRESS"),
    [plot.jobs]
  );

  // Current stage label — routed through the unified `getCurrentStage`
  // helper so this matches Site Programme, Walkthrough, and Daily
  // Brief. Returns the parent stage name when the picked job has a
  // parent (sub-job), or the job's own name when it's a top-level
  // stage. (#23)
  //
  // (May 2026 audit B-P1-24) When every job on the plot is COMPLETED,
  // getCurrentStage now returns null — caller renders "Complete". Pre-
  // fix it returned the last-COMPLETED job's name so the pill said
  // e.g. "Snagging" on a fully-done plot, contradicting the heatmap.
  const currentStage = useMemo(() => {
    if (plot.jobs.length === 0) return null;
    const allComplete = plot.jobs.every((j) => j.status === "COMPLETED");
    if (allComplete) return "Complete";
    const stage = getCurrentStage(
      plot.jobs.map((j) => ({ name: j.parentStage || j.name, status: j.status, sortOrder: j.sortOrder })),
    );
    return stage?.name ?? null;
  }, [plot.jobs]);

  // Unique contractors across all active jobs
  const activeContractors = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string; company: string | null }[] = [];
    for (const job of activeJobs) {
      for (const jc of job.contractors) {
        if (jc.contact && !seen.has(jc.contact.id)) {
          seen.add(jc.contact.id);
          result.push(jc.contact);
        }
      }
    }
    return result;
  }, [activeJobs]);

  // Jobs that haven't started yet but are overdue (startDate < today)
  const overdueStartJobs = useMemo(
    () => plot.jobs.filter((j) => {
      if (j.status !== "NOT_STARTED") return false;
      if (!j.startDate) return false;
      return new Date(j.startDate) < today;
    }),
    [plot.jobs, today]
  );

  return (
    <div className="space-y-6">
      {/* Current Status Strip */}
      {(activeJobs.length > 0 || currentStage) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          {currentStage && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stage</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{currentStage}</span>
            </div>
          )}
          {activeJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</span>
              <div className="flex flex-wrap gap-1">
                {activeJobs.map((j) => (
                  <Link key={j.id} href={`/jobs/${j.id}`} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200">
                    {j.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {activeContractors.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">On Site</span>
              <div className="flex flex-wrap gap-1">
                {activeContractors.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    <HardHat className="size-3" />
                    {c.company || c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {activeJobs.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No jobs currently in progress</span>
          )}
        </div>
      )}

      {/* (May 2026 audit #53) Predictive completion banner. */}
      <PredictiveCompletionBanner plotId={plot.id} />

      {/* (#191) Lateness summary — opens to show every open lateness
          event on this plot with inline reason attribution.
          (May 2026 audit UX-P1) `compact` so the dashed-border
          "Nothing late here." placeholder doesn't flash on plots
          that have no lateness — in compact mode the component
          renders null when there are zero events. */}
      <LatenessSummary plotId={plot.id} status="all" compact />

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
            {/* (May 2026 audit UX-P2) role=progressbar + aria values so
                screen readers announce "X% complete" — pre-fix this
                was a pair of decorative divs with no semantic role. */}
            <div
              role="progressbar"
              aria-valuenow={stats.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Plot build completion"
              className="mt-2 h-1.5 w-full rounded-full bg-muted"
            >
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
              // (May 2026 audit #39) Coach the user toward the canonical
              // way to populate a blank plot — apply a template — rather
              // than just saying "No jobs yet" and leaving them stuck.
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
                <Briefcase className="mx-auto size-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No jobs yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Apply a plot template from the site&apos;s Plots tab to populate
                  the programme in one click, or add jobs individually below.
                </p>
              </div>
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
                        <div className="flex gap-1" role="list" aria-label="Job statuses">
                          {/* (May 2026 a11y audit #36) Color-only status
                              dots failed colour-blind users + screen
                              readers. The title attribute alone isn't
                              announced reliably (Safari/VoiceOver). Each
                              dot now has role="img" + aria-label so the
                              status word is read out, while sighted
                              users still see the compact dot strip. */}
                          {group.jobs.map((job) => {
                            const cfg =
                              JOB_STATUS_CONFIG[job.status] ??
                              JOB_STATUS_CONFIG.NOT_STARTED;
                            return (
                              <span
                                key={job.id}
                                role="img"
                                aria-label={`${job.name}: ${cfg.label}`}
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
            {activeJobs.length === 0 && overdueStartJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No jobs currently in progress
              </p>
            ) : (
              <div className="space-y-2">
                {/* Overdue-start jobs — should have been started */}
                {overdueStartJobs.map((job) => {
                  const isPending = pendingJobActions.has(job.id);
                  return (
                    <div key={job.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${job.id}`} className="truncate text-sm font-medium text-blue-600 hover:underline">
                          {job.name}
                        </Link>
                        <p className="text-xs text-amber-700">
                          Should have started {format(new Date(job.startDate!), "d MMM")}
                        </p>
                      </div>
                      {isPending ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Button variant="outline" size="sm"
                          className="h-7 shrink-0 gap-1 border-green-200 px-2 text-[11px] text-green-700 hover:bg-green-50"
                          onClick={() => handleJobAction(job.id, "start")}>
                          <Play className="size-3" /> Start
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* Active in-progress jobs */}
                {activeJobs.map((job) => {
                  const contractor = job.contractors?.[0]?.contact;
                  const isPending = pendingJobActions.has(job.id);
                  const isOverdue = job.endDate && new Date(job.endDate) < today;
                  return (
                    <div
                      key={job.id}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 ${isOverdue ? "border-red-200 bg-red-50/40" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${job.id}`} className="truncate text-sm font-medium text-blue-600 hover:underline">
                          {job.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          {(job.assignedTo || contractor) && (
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3" />
                              {job.assignedTo?.name || (contractor?.company ? contractor.company : contractor?.name)}
                            </span>
                          )}
                          {job.endDate && (
                            <span className={`inline-flex items-center gap-1 ${isOverdue ? "font-medium text-red-600" : ""}`}>
                              <CalendarDays className="size-3" />
                              {isOverdue ? "Overdue — " : "Due "}
                              {format(new Date(job.endDate), "d MMM")}
                            </span>
                          )}
                        </div>
                      </div>
                      {isPending ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Button variant="outline" size="sm"
                          className="h-7 shrink-0 gap-1 border-blue-200 px-2 text-[11px] text-blue-700 hover:bg-blue-50"
                          onClick={() => handleJobAction(job.id, "complete")}>
                          <CheckCircle2 className="size-3" /> Complete
                        </Button>
                      )}
                    </div>
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
                    {isOrderPending(order.id) ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="outline" size="sm"
                        className="h-6 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                        onClick={() => handleOrderStatus(order.id, "DELIVERED")}>
                        <CheckCircle2 className="mr-1 size-2.5" />Mark Received
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
                    {isOrderPending(order.id) ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="outline" size="sm"
                        className="h-6 shrink-0 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
                        onClick={() => handleOrderStatus(order.id, "DELIVERED")}>
                        <CheckCircle2 className="mr-1 size-2.5" />Mark Received
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Snags</CardTitle>
              <div className="flex items-center gap-2">
                <Link
                  href={`/sites/${plot.site.id}?tab=snags`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View all
                </Link>
                <Link
                  href={`/sites/${plot.site.id}?tab=snags&action=new&plotId=${plot.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200 px-2 text-[11px] text-orange-700 transition-colors hover:bg-orange-50"
                >
                  <Plus className="size-3" /> Add Snag
                </Link>
              </div>
            </div>
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
                  <Link
                    key={item.label}
                    href={`/sites/${plot.site.id}?tab=snags`}
                    className={`rounded-lg p-3 transition-opacity hover:opacity-80 ${item.bg}`}
                  >
                    <p className={`text-xl font-bold ${item.color}`}>
                      {item.count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Centralised pre-start / early-start / order-conflict dialogs */}
      {jobActionDialogs}
      <PostCompletionDialog
        open={!!completionContext}
        completedJobName={completionContext?.completedJobName ?? ""}
        daysDeviation={completionContext?.daysDeviation ?? 0}
        nextJob={completionContext?.nextJob ?? null}
        plotId={completionContext?.plotId ?? plot.id}
        onClose={() => setCompletionContext(null)}
        onDecisionMade={() => { setCompletionContext(null); forceRefresh(); }}
      />
    </div>
  );
}

// ---------- House Value Card ----------
// (May 2026 Keith request) Shows + edits the plot's house value — the
// target build cost and the sale price (GDV), snapshotted from the
// template/variant at apply time. Margin is derived. Edits PUT to
// /api/plots/[id].

function HouseValueCard({
  plot,
  onSaved,
}: {
  plot: PlotData;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initialBudget =
    plot.buildBudget != null ? String(plot.buildBudget) : "";
  const initialSale = plot.salePrice != null ? String(plot.salePrice) : "";
  const [budget, setBudget] = useState(initialBudget);
  const [sale, setSale] = useState(initialSale);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/plots/${plot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildBudget: budget === "" ? null : Number(budget),
          salePrice: sale === "" ? null : Number(sale),
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to save house value"));
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) => `£${n.toLocaleString()}`;
  const margin =
    plot.buildBudget != null && plot.salePrice != null
      ? plot.salePrice - plot.buildBudget
      : null;
  const marginPct =
    margin != null && plot.salePrice
      ? Math.round((margin / plot.salePrice) * 100)
      : null;

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PoundSterling className="size-4 text-emerald-600" />
          House value
        </h2>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">
              Build budget £
            </span>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-8 w-32 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">
              Sale price £
            </span>
            <Input
              type="number"
              value={sale}
              onChange={(e) => setSale(e.target.value)}
              className="h-8 w-32 text-sm"
            />
          </label>
          <Button
            size="sm"
            className="h-8"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              setEditing(false);
              setBudget(initialBudget);
              setSale(initialSale);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Build budget </span>
            <span className="font-semibold">
              {plot.buildBudget != null ? fmt(plot.buildBudget) : "—"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Sale price </span>
            <span className="font-semibold">
              {plot.salePrice != null ? fmt(plot.salePrice) : "—"}
            </span>
          </span>
          {margin != null && (
            <span>
              <span className="text-muted-foreground">Margin </span>
              <span
                className={`font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {fmt(margin)}
                {marginPct != null ? ` (${marginPct}%)` : ""}
              </span>
            </span>
          )}
        </div>
      )}
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
  const searchParams = useSearchParams();
  const { devDate } = useDevDate();

  // Tab persistence — same pattern as Settings/Suppliers. `?tab=X`
  // restores on refresh / deep link. Default "overview" if absent.
  const VALID_TABS = useMemo(
    () =>
      new Set([
        "overview",
        "gantt",
        "todo",
        "jobs",
        "history",
        "materials",
        "drawings",
        "handover",
        "customer",
      ]),
    [],
  );
  const tabFromUrl = searchParams?.get("tab") ?? "";
  const activeTab = VALID_TABS.has(tabFromUrl) ? tabFromUrl : "overview";
  function handleTabChange(next: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }

  // Auto-refresh when user navigates back or tab regains focus
  const refreshPlot = useCallback(() => { router.refresh(); }, [router]);
  useRefreshOnFocus(refreshPlot);

  const jobsWithDates = plot.jobs.filter(
    (j) => j.startDate !== null || j.endDate !== null
  );

  function handleJobCreated() {
    router.refresh();
  }

  // Share link state (P2)
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const { copy: copyShareToClipboard, copied: shareCopied } = useCopyToClipboard();

  const handleGenerateShareLink = async () => {
    setShareLoading(true);
    setShareError(null);
    try {
      const res = await fetch("/api/share/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plotId: plot.id, expiryDays: 30 }),
      });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.url);
        setShareExpiry(data.expiresAt);
      } else {
        setShareError("Failed to generate link — please try again");
      }
    } catch {
      setShareError("Network error — please try again");
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    await copyShareToClipboard(shareUrl);
  };

  return (
    <div className="space-y-6">
      {/* Back + Breadcrumb */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Breadcrumbs items={[
          { label: "Sites", href: "/sites" },
          { label: plot.site.name, href: `/sites/${plot.site.id}` },
          { label: plot.name },
        ]} />
      </div>

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

        {/* (#182) Action strip wraps on narrow viewports — Share /
            Recalculate / Edit / Delete pushed off-screen on phones. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { setShareDialogOpen(true); setShareUrl(null); setShareExpiry(null); setShareError(null); }}
          >
            <Share2 className="size-3.5" />
            Share
          </Button>
          {/* AddJobDialog hidden – functionality preserved */}
          <div className="hidden">
            <AddJobDialog plotId={plot.id} onCreated={handleJobCreated} />
          </div>
        </div>
      </div>

      {/* (May 2026 Keith request) House value — target build cost +
          sale price, with derived margin. Sits in the plot info up top
          so it's visible on every tab. */}
      <HouseValueCard plot={plot} onSaved={refreshPlot} />

      {/* Tabs — URL-backed via ?tab=X so refresh keeps the user where
          they are. Same pattern as Settings + Suppliers. */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => v !== null && handleTabChange(v)}
      >
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
          <TabsTrigger value="materials">
            <Package className="size-4" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="drawings">
            <FileCheck className="size-4" />
            Drawings
          </TabsTrigger>
          <TabsTrigger value="handover">
            <FileCheck className="size-4" />
            Handover
          </TabsTrigger>
          <TabsTrigger value="customer">
            <Heart className="size-4" />
            Customer view
          </TabsTrigger>
          {/* (May 2026 audit #175 + #169 + #177) Combined quality /
              commercial / warranty tracker. */}
          <TabsTrigger value="quality">
            <ClipboardCheck className="size-4" />
            Quality
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
            <GanttChart key={devDate ?? "live"} jobs={plot.jobs} enableDateControls />
          )}
        </TabsContent>

        {/* To-Do List Tab */}
        <TabsContent value="todo">
          <PlotTodoList
            jobs={plot.jobs}
            snagSummary={snagSummary}
            siteId={plot.site.id}
            siteName={plot.site.name}
            plotId={plot.id}
            plotName={plot.name}
            plotNumber={plot.plotNumber}
          />
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
                <div className="mt-4 hidden">
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
                        <JobStatusBadge status={job.status} />
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
                        {job.contractors.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <HardHat className="size-3" />
                            {job.contractors
                              .map((jc) => jc.contact?.company || jc.contact?.name)
                              .filter(Boolean)
                              .join(", ")}
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

              <div className="pt-2 hidden">
                <AddJobDialog plotId={plot.id} onCreated={handleJobCreated} />
              </div>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <PlotHistoryTab plotId={plot.id} />
        </TabsContent>

        {/* Materials Tab */}
        <TabsContent value="materials">
          <PlotMaterialsSection plotId={plot.id} />
        </TabsContent>

        {/* Drawings Tab */}
        <TabsContent value="drawings">
          <PlotDrawingsSection plotId={plot.id} siteId={plot.site.id} />
        </TabsContent>

        <TabsContent value="handover">
          <HandoverChecklist plotId={plot.id} />
        </TabsContent>

        {/* Customer view — manage /progress/<token> link, journal,
            curated photos. Hard-locked to never show dates / snags /
            orders / contractors to the buyer. */}
        <TabsContent value="customer">
          <PlotCustomerViewTab plotId={plot.id} />
        </TabsContent>

        {/* (May 2026 audit #175 + #169 + #177) Quality / commercial /
            warranty panel — pre-start checks, variations, defects. */}
        <TabsContent value="quality">
          <PlotQualityPanel plotId={plot.id} />
        </TabsContent>
      </Tabs>

      {/* Share Link Dialog (P2) */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-5 text-blue-600" />
              Share Plot with Contractor
            </DialogTitle>
            <DialogDescription>
              Generate a read-only link for{" "}
              <span className="font-medium text-foreground">
                {plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name}
              </span>
              . No login required — valid for 30 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!shareUrl ? (
              <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">
                <p>The contractor will be able to see:</p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-slate-500">
                  <li>All job stages and their status</li>
                  <li>Scheduled and actual dates</li>
                  <li>Assigned trades (name only)</li>
                  <li>Build progress percentage</li>
                </ul>
                <p className="mt-2 text-xs text-slate-400">Financial data and orders are not included.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3">
                  <p className="flex-1 truncate text-xs text-slate-700 font-mono">{shareUrl}</p>
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="flex shrink-0 items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50"
                  >
                    {shareCopied ? (
                      <><Check className="size-3 text-green-600" /> Copied!</>
                    ) : (
                      <><Copy className="size-3" /> Copy</>
                    )}
                  </button>
                </div>
                {shareExpiry && (
                  <p className="text-center text-[11px] text-slate-400">
                    Expires {format(new Date(shareExpiry), "dd MMM yyyy")}
                  </p>
                )}
              </div>
            )}
            {shareError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{shareError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
            {!shareUrl && (
              <Button size="sm" disabled={shareLoading} onClick={handleGenerateShareLink}>
                {shareLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Share2 className="mr-1.5 size-3.5" />}
                Generate Link
              </Button>
            )}
            {shareUrl && (
              <Button size="sm" variant="outline" disabled={shareLoading} onClick={handleGenerateShareLink}>
                {shareLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Regenerate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────── Predictive Completion banner ───────────────────────────────
//
// (May 2026 audit #53) Pulls the predictive-completion endpoint and
// renders a calm 1-line banner near the top of the plot overview.
// Three states:
//   - stalled      → red, "No completions in 30 days"
//   - on/under     → emerald, "On track" with predicted date
//   - over plan    → amber, "Predicted X days late"
//   - no data      → nothing rendered

interface PredictiveData {
  predictedDate: string | null;
  predictedDaysRemaining: number | null;
  slippageDays: number | null;
  velocity: number;
  remaining: number;
  stalled: boolean;
}

function PredictiveCompletionBanner({ plotId }: { plotId: string }) {
  const [data, setData] = useState<PredictiveData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plots/${plotId}/predictive-completion`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [plotId]);

  if (!data) return null;
  if (data.remaining === 0) return null; // plot complete; no prediction needed

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  if (data.stalled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        <strong>Stalled.</strong> No job completions in the last 30 days. {data.remaining} job{data.remaining !== 1 ? "s" : ""} remaining.
      </div>
    );
  }
  if (!data.predictedDate) return null;
  const slip = data.slippageDays ?? 0;
  let cls = "border-emerald-200 bg-emerald-50 text-emerald-800";
  let lead = "On track.";
  if (slip > 7) {
    cls = "border-amber-200 bg-amber-50 text-amber-900";
    lead = `Predicted ${slip} days late.`;
  } else if (slip < -7) {
    lead = `Predicted ${Math.abs(slip)} days early.`;
  }
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <strong>{lead}</strong>{" "}
      At current velocity ({data.velocity.toFixed(2)} jobs/day) {data.remaining} job
      {data.remaining !== 1 ? "s" : ""} remaining — predicted finish {fmt(data.predictedDate)}.
    </div>
  );
}
