"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useJobAction } from "@/hooks/useJobAction";
import { PostCompletionDialog } from "@/components/PostCompletionDialog";
import { differenceInCalendarDays, isSameDay, format } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { cn } from "@/lib/utils";
import {
  Package,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Play,
  Briefcase,
  Loader2,
  Check,
  X,
  ChevronDown,
  FileCheck,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------- Types ----------

interface OrderData {
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
}

interface JobData {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  signedOffAt: string | null;
  parentId: string | null;
  parentStage: string | null;
  assignedTo: { id: string; name: string } | null;
  contractors: Array<{
    contact: { id: string; name: string; company: string | null } | null;
  }>;
  orders: OrderData[];
}

interface PlotTodoListProps {
  jobs: JobData[];
  snagSummary: Record<string, number>;
  siteId: string;
  plotId: string;
}

// ---------- Helpers ----------

async function updateOrderStatus(orderId: string, status: string) {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update order");
}

// ---------- Component ----------

export function PlotTodoList({ jobs, snagSummary, siteId, plotId }: PlotTodoListProps) {
  const router = useRouter();
  const now = getCurrentDate();

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["jobs", "materials", "snags"])
  );
  const [pendingJobActions, setPendingJobActions] = useState<Set<string>>(new Set());
  const [pendingOrderActions, setPendingOrderActions] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [completionContext, setCompletionContext] = useState<any>(null);

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Centralised pre-start flow
  const { triggerAction: triggerJobAction, dialogs: jobActionDialogs } = useJobAction(
    (_action, _jobId) => { router.refresh(); }
  );

  async function handleJobAction(jobId: string, action: "start" | "complete") {
    const jobData = jobs.find((j) => j.id === jobId);
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
    // Complete action
    setPendingJobActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const result = await res.json();
        router.refresh();
        if (result._completionContext) {
          const jobName = jobs.find((j) => j.id === jobId)?.name || "";
          setCompletionContext({ completedJobName: jobName, ...result._completionContext });
        }
      }
    } finally {
      setPendingJobActions((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  }

  async function handleSignOff(jobId: string) {
    setPendingJobActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signoff" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPendingJobActions((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  }

  async function handleOrderStatus(orderId: string, status: string) {
    setPendingOrderActions((prev) => new Set(prev).add(orderId));
    try {
      await updateOrderStatus(orderId, status);
      router.refresh();
    } finally {
      setPendingOrderActions((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    }
  }

  // ---------- Derive sections ----------

  const sections = useMemo(() => {
    // Filter to LEAF jobs only for action lists — parent-stage jobs are derived rollups
    const parentIds = new Set(jobs.filter((j) => j.parentId).map((j) => j.parentId!));
    const leafJobs = jobs.filter((j) => !parentIds.has(j.id));

    // Jobs: Starting today (NOT_STARTED with startDate <= today)
    const starting = leafJobs.filter((j) => {
      if (j.status !== "NOT_STARTED" || !j.startDate) return false;
      return new Date(j.startDate) <= now;
    });

    // Jobs: In Progress
    const inProgress = leafJobs.filter((j) => j.status === "IN_PROGRESS");

    // Jobs: Awaiting Sign Off (COMPLETED but not signed off)
    const awaitingSignOff = leafJobs.filter(
      (j) => j.status === "COMPLETED" && !j.signedOffAt
    );

    // Materials: Deliveries today (orders on ALL jobs — including parent-stage orders)
    const allOrders = jobs.flatMap((j) =>
      j.orders.map((o) => ({ ...o, jobId: j.id, jobName: j.name }))
    );

    const deliveriesToday = allOrders.filter((o) => {
      if (o.status !== "ORDERED" || !o.expectedDeliveryDate) return false;
      return isSameDay(new Date(o.expectedDeliveryDate), now);
    });

    // Materials: Orders to place (PENDING, dateOfOrder <= today)
    const ordersToPlace = allOrders.filter((o) => {
      if (o.status !== "PENDING") return false;
      return new Date(o.dateOfOrder) <= now;
    });

    // Snag counts
    const openSnags = (snagSummary["OPEN"] || 0) + (snagSummary["IN_PROGRESS"] || 0);

    return { starting, inProgress, awaitingSignOff, deliveriesToday, ordersToPlace, openSnags };
  }, [jobs, snagSummary, now]);

  const jobCount = sections.starting.length + sections.inProgress.length + sections.awaitingSignOff.length;
  const materialCount = sections.deliveriesToday.length + sections.ordersToPlace.length;

  return (
    <div className="space-y-4">
      {jobActionDialogs}
      <PostCompletionDialog
        open={!!completionContext}
        completedJobName={completionContext?.completedJobName ?? ""}
        daysDeviation={completionContext?.daysDeviation ?? 0}
        nextJob={completionContext?.nextJob ?? null}
        plotId={completionContext?.plotId ?? plotId}
        onClose={() => setCompletionContext(null)}
        onDecisionMade={() => { setCompletionContext(null); router.refresh(); }}
      />

      {/* ========== JOBS SECTION ========== */}
      <Card>
        <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("jobs")}>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-blue-600" />
            Jobs ({jobCount})
            <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("jobs") && "rotate-180")} />
          </CardTitle>
        </CardHeader>
        {openSections.has("jobs") && (
          <CardContent>
            {jobCount === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs need action today</p>
            ) : (
              <div className="space-y-2">
                {/* Starting */}
                {sections.starting.length > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-green-700">
                    <Play className="size-3" /> Starting ({sections.starting.length})
                  </p>
                )}
                {sections.starting.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    variant="start"
                    isPending={pendingJobActions.has(j.id)}
                    onAction={handleJobAction}
                    now={now}
                  />
                ))}

                {/* In Progress */}
                {sections.inProgress.length > 0 && (
                  <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700", sections.starting.length > 0 && "mt-3 border-t pt-3")}>
                    <Clock className="size-3" /> In Progress ({sections.inProgress.length})
                  </p>
                )}
                {sections.inProgress.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    variant="progress"
                    isPending={pendingJobActions.has(j.id)}
                    onAction={handleJobAction}
                    now={now}
                  />
                ))}

                {/* Awaiting Sign Off */}
                {sections.awaitingSignOff.length > 0 && (
                  <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700", (sections.starting.length > 0 || sections.inProgress.length > 0) && "mt-3 border-t pt-3")}>
                    <FileCheck className="size-3" /> Awaiting Sign Off ({sections.awaitingSignOff.length})
                  </p>
                )}
                {sections.awaitingSignOff.map((j) => (
                  <SignOffRow
                    key={j.id}
                    job={j}
                    isPending={pendingJobActions.has(j.id)}
                    onSignOff={handleSignOff}
                    now={now}
                  />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ========== MATERIALS SECTION ========== */}
      <Card>
        <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("materials")}>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Package className="size-4 text-violet-600" />
            Materials ({materialCount})
            <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("materials") && "rotate-180")} />
          </CardTitle>
        </CardHeader>
        {openSections.has("materials") && (
          <CardContent>
            {materialCount === 0 ? (
              <p className="text-sm text-muted-foreground">No materials need action today</p>
            ) : (
              <div className="space-y-2">
                {/* Deliveries Today */}
                {sections.deliveriesToday.length > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    <Truck className="size-3" /> Deliveries Today ({sections.deliveriesToday.length})
                  </p>
                )}
                {sections.deliveriesToday.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    variant="delivery"
                    isPending={pendingOrderActions.has(o.id)}
                    onAction={handleOrderStatus}
                  />
                ))}

                {/* Orders to Place */}
                {sections.ordersToPlace.length > 0 && (
                  <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700", sections.deliveriesToday.length > 0 && "mt-3 border-t pt-3")}>
                    <Package className="size-3" /> Orders to Place ({sections.ordersToPlace.length})
                  </p>
                )}
                {sections.ordersToPlace.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    variant="place"
                    isPending={pendingOrderActions.has(o.id)}
                    onAction={handleOrderStatus}
                  />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ========== SNAGS SECTION ========== */}
      <Card>
        <CardHeader className="cursor-pointer select-none pb-2" onClick={() => toggleSection("snags")}>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bug className="size-4 text-orange-600" />
            Open Snags ({sections.openSnags})
            <ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform duration-200", openSections.has("snags") && "rotate-180")} />
          </CardTitle>
        </CardHeader>
        {openSections.has("snags") && (
          <CardContent>
            {sections.openSnags === 0 ? (
              <p className="text-sm text-muted-foreground">No open snags on this plot</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  {(snagSummary["OPEN"] || 0) > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertTriangle className="size-3" />
                      {snagSummary["OPEN"]} open
                    </span>
                  )}
                  {(snagSummary["IN_PROGRESS"] || 0) > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Clock className="size-3" />
                      {snagSummary["IN_PROGRESS"]} in progress
                    </span>
                  )}
                </div>
                <Link
                  href={`/sites/${siteId}?tab=snags`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  View all snags
                </Link>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ---------- Job Row ----------

function JobRow({
  job,
  variant,
  isPending,
  onAction,
  now,
}: {
  job: JobData;
  variant: "start" | "progress";
  isPending: boolean;
  onAction: (id: string, action: "start" | "complete") => void;
  now: Date;
}) {
  const contractor = job.contractors?.[0]?.contact;
  const isOverdue = variant === "progress" && job.endDate && new Date(job.endDate) < now;

  // Readiness checklist for NOT_STARTED jobs
  const readiness = variant === "start" ? {
    hasContractor: (job.contractors?.length || 0) > 0 && !!job.contractors[0]?.contact,
    hasAssignee: !!job.assignedTo,
    ordersSent: job.orders.filter((o) => o.status === "PENDING").length === 0,
    materialsOnSite: job.orders.filter((o) => o.status === "ORDERED").length === 0 && job.orders.filter((o) => o.status === "PENDING").length === 0,
  } : null;

  return (
    <div className={cn("rounded border p-2 text-sm", isOverdue && "border-red-200 bg-red-50/30")}>
      <div className="flex items-center gap-2">
        <Link href={`/jobs/${job.id}`} className="truncate font-medium text-blue-600 hover:underline">
          {job.name}
        </Link>
        {isOverdue && (
          <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            Overdue
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {variant === "start" && job.startDate && (
          <>Should have started {format(new Date(job.startDate), "d MMM")}</>
        )}
        {variant === "progress" && job.endDate && (
          <>{isOverdue ? "Due" : "Due"} {format(new Date(job.endDate), "d MMM")}</>
        )}
        {job.assignedTo && <span> &middot; {job.assignedTo.name}</span>}
        {contractor && <span className="hidden sm:inline"> &middot; {contractor.company || contractor.name}</span>}
      </p>

      {/* Readiness checklist */}
      {readiness && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {readiness.hasContractor ? (
            <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Contractor</span>
          ) : (
            <span className="text-red-600"><X className="inline size-3 mr-0.5" />Contractor</span>
          )}
          {readiness.hasAssignee ? (
            <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Assignee</span>
          ) : (
            <span className="text-red-600"><X className="inline size-3 mr-0.5" />Assignee</span>
          )}
          {readiness.ordersSent ? (
            <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Orders Sent</span>
          ) : (
            <span className="text-red-600"><X className="inline size-3 mr-0.5" />{job.orders.filter((o) => o.status === "PENDING").length} not sent</span>
          )}
          {readiness.materialsOnSite ? (
            <span className="text-green-700"><Check className="inline size-3 mr-0.5" />Materials</span>
          ) : (
            <span className="text-amber-600"><Clock className="inline size-3 mr-0.5" />{job.orders.filter((o) => o.status === "ORDERED").length} awaiting</span>
          )}
        </div>
      )}

      {/* Actions line */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
        <span className="w-full text-[10px] font-medium text-muted-foreground sm:mr-auto sm:w-auto">Actions</span>
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : variant === "start" ? (
          <Button size="sm" variant="outline" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
            onClick={() => onAction(job.id, "start")}>
            <Play className="size-2.5" /> Start
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
            onClick={() => onAction(job.id, "complete")}>
            <CheckCircle2 className="size-2.5" /> Complete
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Sign Off Row ----------

function SignOffRow({
  job,
  isPending,
  onSignOff,
  now,
}: {
  job: JobData;
  isPending: boolean;
  onSignOff: (id: string) => void;
  now: Date;
}) {
  const contractor = job.contractors?.[0]?.contact;
  const daysSinceComplete = job.endDate ? differenceInCalendarDays(now, new Date(job.endDate)) : 0;

  return (
    <div className="rounded border border-amber-100 bg-amber-50/50 p-2 text-sm">
      <div className="flex items-center gap-2">
        <Link href={`/jobs/${job.id}`} className="font-medium text-foreground hover:underline">
          {job.name}
        </Link>
        <span className="shrink-0 rounded-full border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          Sign Off
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {contractor && <>{contractor.company || contractor.name}</>}
        {daysSinceComplete > 0 && <span> &middot; Completed {daysSinceComplete} day{daysSinceComplete !== 1 ? "s" : ""} ago</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-amber-200 pt-1.5">
        <span className="w-full text-[10px] font-medium text-muted-foreground sm:mr-auto sm:w-auto">Actions</span>
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Button size="sm" variant="outline" className="h-6 gap-1 border-amber-300 px-2 text-[10px] text-amber-700 hover:bg-amber-100"
            onClick={() => onSignOff(job.id)}>
            <FileCheck className="size-2.5" /> Sign Off
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Order Row ----------

function OrderRow({
  order,
  variant,
  isPending,
  onAction,
}: {
  order: OrderData & { jobId: string; jobName: string };
  variant: "delivery" | "place";
  isPending: boolean;
  onAction: (orderId: string, status: string) => void;
}) {
  const mailto = variant === "place" && order.supplier.contactEmail
    ? `mailto:${encodeURIComponent(order.supplier.contactEmail)}?subject=${encodeURIComponent(`Material Order — ${order.jobName}`)}&body=${encodeURIComponent(`Hi ${order.supplier.contactName || order.supplier.name},\n\nPlease supply the following for ${order.jobName}:\n\n${order.itemsDescription || "Materials as discussed"}${order.expectedDeliveryDate ? `\n\nRequired by: ${format(new Date(order.expectedDeliveryDate), "dd MMM yyyy")}` : ""}\n\nPlease confirm receipt.\n\nRegards`)}`
    : null;

  return (
    <div className={cn("rounded border p-2 text-sm", variant === "delivery" && "border-amber-100 bg-amber-50/30")}>
      <div className="flex items-center gap-2">
        <Link href={`/suppliers/${order.supplier.id}`} className="font-medium text-blue-600 hover:underline">
          {order.supplier.name}
        </Link>
        {order.orderDetails && (
          <span className="truncate text-xs text-muted-foreground">-- {order.orderDetails}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        For <Link href={`/jobs/${order.jobId}`} className="font-medium text-foreground hover:underline">{order.jobName}</Link>
        {variant === "delivery" && order.expectedDeliveryDate && (
          <span> &middot; Expected {format(new Date(order.expectedDeliveryDate), "d MMM")}</span>
        )}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t pt-1.5">
        <span className="w-full text-[10px] font-medium text-muted-foreground sm:mr-auto sm:w-auto">Actions</span>
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : variant === "delivery" ? (
          <Button size="sm" variant="outline" className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
            onClick={() => onAction(order.id, "DELIVERED")}>
            <CheckCircle2 className="size-2.5" /> Mark Received
          </Button>
        ) : (
          <>
            {mailto && (
              <Button size="sm" variant="outline" className="h-6 gap-1 border-violet-200 px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                onClick={() => { window.open(mailto, "_blank"); onAction(order.id, "ORDERED"); }}>
                <Mail className="size-2.5" /> Send Order
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
              onClick={() => onAction(order.id, "ORDERED")}>
              <Package className="size-2.5" /> {mailto ? "Mark Sent" : "Place Order"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
