"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  differenceInDays,
  addWeeks,
  isBefore,
  isAfter,
  format,
  subWeeks,
} from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import {
  Package,
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  Play,
  CheckCircle2,
  Briefcase,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  assignedTo: { id: string; name: string } | null;
  orders: OrderData[];
}

interface TodoItem {
  type: "order-needed" | "pending-order" | "upcoming-delivery" | "overdue" | "completed";
  jobId: string;
  jobName: string;
  order?: OrderData;
  daysUntilStart?: number;
  daysOverdue?: number;
}

// ---------- Component ----------

export function PlotTodoList({ jobs }: { jobs: JobData[] }) {
  const router = useRouter();
  const now = getCurrentDate();
  const fourWeeksFromNow = addWeeks(now, 4);
  const twoWeeksAgo = subWeeks(now, 2);
  const [pendingJobActions, setPendingJobActions] = useState<Set<string>>(new Set());
  const [completedJobIds, setCompletedJobIds] = useState<Set<string>>(new Set());

  async function handleJobAction(jobId: string, action: "start" | "complete") {
    setPendingJobActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === "complete") {
          setCompletedJobIds((prev) => new Set(prev).add(jobId));
        }
        router.refresh();
      }
    } finally {
      setPendingJobActions((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  }

  // Derive job sections
  const activeJobs = jobs.filter((j) => j.status === "IN_PROGRESS");
  const overdueStartJobs = jobs.filter((j) => {
    if (j.status !== "NOT_STARTED" || !j.startDate) return false;
    return new Date(j.startDate) < now;
  });
  const overdueEndJobs = jobs.filter((j) => {
    if (j.status === "COMPLETED" || j.status === "NOT_STARTED") return false;
    if (!j.endDate) return false;
    return new Date(j.endDate) < now;
  });
  const hasJobItems = activeJobs.length > 0 || overdueStartJobs.length > 0;

  // Derive todo items from jobs and orders
  const ordersToPlace: TodoItem[] = [];
  const upcomingDeliveries: TodoItem[] = [];
  const overdueItems: TodoItem[] = [];
  const recentlyCompleted: TodoItem[] = [];

  for (const job of jobs) {
    // Jobs starting within 4 weeks with no orders
    if (
      job.startDate &&
      job.orders.length === 0 &&
      job.status !== "COMPLETED"
    ) {
      const startDate = new Date(job.startDate);
      if (isBefore(startDate, fourWeeksFromNow) && isAfter(startDate, now)) {
        const daysUntil = differenceInDays(startDate, now);
        ordersToPlace.push({
          type: "order-needed",
          jobId: job.id,
          jobName: job.name,
          daysUntilStart: daysUntil,
        });
      }
    }

    for (const order of job.orders) {
      // Pending orders (not yet sent to supplier)
      if (order.status === "PENDING") {
        ordersToPlace.push({
          type: "pending-order",
          jobId: job.id,
          jobName: job.name,
          order,
        });
      }

      // Upcoming deliveries (next 4 weeks, status ORDERED or CONFIRMED)
      if (
        order.expectedDeliveryDate &&
        (order.status === "ORDERED" || order.status === "CONFIRMED")
      ) {
        const expectedDate = new Date(order.expectedDeliveryDate);

        if (isBefore(expectedDate, now)) {
          // Past due -- goes to overdue section
          const daysOverdue = differenceInDays(now, expectedDate);
          overdueItems.push({
            type: "overdue",
            jobId: job.id,
            jobName: job.name,
            order,
            daysOverdue,
          });
        } else if (isBefore(expectedDate, fourWeeksFromNow)) {
          upcomingDeliveries.push({
            type: "upcoming-delivery",
            jobId: job.id,
            jobName: job.name,
            order,
          });
        }
      }

      // Overdue: expected date has passed and not delivered/cancelled (no expectedDeliveryDate case)
      if (
        order.expectedDeliveryDate &&
        order.status !== "DELIVERED" &&
        order.status !== "CANCELLED" &&
        order.status !== "ORDERED" &&
        order.status !== "CONFIRMED" &&
        order.status !== "PENDING"
      ) {
        const expectedDate = new Date(order.expectedDeliveryDate);
        if (isBefore(expectedDate, now)) {
          const daysOverdue = differenceInDays(now, expectedDate);
          overdueItems.push({
            type: "overdue",
            jobId: job.id,
            jobName: job.name,
            order,
            daysOverdue,
          });
        }
      }

      // Recently completed (delivered in last 2 weeks)
      if (order.status === "DELIVERED" && order.deliveredDate) {
        const deliveredDate = new Date(order.deliveredDate);
        if (isAfter(deliveredDate, twoWeeksAgo)) {
          recentlyCompleted.push({
            type: "completed",
            jobId: job.id,
            jobName: job.name,
            order,
          });
        }
      }
    }
  }

  // Sort overdue items by most overdue first
  overdueItems.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));

  // Sort upcoming deliveries by date
  upcomingDeliveries.sort((a, b) => {
    const dateA = a.order?.expectedDeliveryDate ?? "";
    const dateB = b.order?.expectedDeliveryDate ?? "";
    return dateA.localeCompare(dateB);
  });

  return (
    <div className="space-y-6">
      {/* Section 0: Active Jobs */}
      {hasJobItems && (
        <TodoSection
          title="Jobs to Action"
          icon={Briefcase}
          iconColor="text-blue-600"
          count={activeJobs.length + overdueStartJobs.length}
          emptyMessage=""
        >
          {/* Jobs that should have started */}
          {overdueStartJobs.map((job) => {
            const isPending = pendingJobActions.has(job.id);
            const isDone = completedJobIds.has(job.id);
            return (
              <Card key={job.id} size="sm" className="border-amber-200">
                <CardContent className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                    <Briefcase className="size-4 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <Link href={`/jobs/${job.id}`} className="hover:underline hover:text-blue-600">{job.name}</Link>
                    </p>
                    <p className="text-xs text-amber-700">
                      Should have started {job.startDate ? format(new Date(job.startDate), "d MMM") : "—"}
                      {job.assignedTo && <span className="text-muted-foreground"> · {job.assignedTo.name}</span>}
                    </p>
                  </div>
                  {isDone ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><Check className="size-3" /> Started</span>
                  ) : isPending ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button variant="outline" size="xs" className="border-green-200 text-green-700 hover:bg-green-50"
                      onClick={() => handleJobAction(job.id, "start")}>
                      <Play className="size-3" /> Start
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Active in-progress jobs */}
          {activeJobs.map((job) => {
            const isPending = pendingJobActions.has(job.id);
            const isDone = completedJobIds.has(job.id);
            const isOverdue = job.endDate && new Date(job.endDate) < now;
            return (
              <Card key={job.id} size="sm" className={isOverdue ? "border-red-200" : ""}>
                <CardContent className="flex items-center gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${isOverdue ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                    <Briefcase className={`size-4 ${isOverdue ? "text-red-500" : "text-blue-500"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <Link href={`/jobs/${job.id}`} className="hover:underline hover:text-blue-600">{job.name}</Link>
                    </p>
                    <p className={`text-xs ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                      {isOverdue
                        ? `Overdue — due ${job.endDate ? format(new Date(job.endDate), "d MMM") : "—"}`
                        : job.endDate ? `Due ${format(new Date(job.endDate), "d MMM")}` : "In Progress"}
                      {job.assignedTo && <span className="text-muted-foreground"> · {job.assignedTo.name}</span>}
                    </p>
                  </div>
                  {isDone ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><Check className="size-3" /> Complete</span>
                  ) : isPending ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button variant="outline" size="xs" className="border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => handleJobAction(job.id, "complete")}>
                      <CheckCircle2 className="size-3" /> Complete
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TodoSection>
      )}

      {/* Section 1: Orders to Place */}
      <TodoSection
        title="Orders to Place"
        icon={Package}
        iconColor="text-blue-500"
        count={ordersToPlace.length}
        emptyMessage="No orders need attention right now."
      >
        {ordersToPlace.map((item, idx) => (
          <OrderToPlaceCard
            key={`place-${idx}`}
            item={item}
            onUpdate={() => router.refresh()}
          />
        ))}
      </TodoSection>

      {/* Section 2: Upcoming Deliveries */}
      <TodoSection
        title="Upcoming Deliveries"
        icon={Truck}
        iconColor="text-amber-500"
        count={upcomingDeliveries.length}
        emptyMessage="No deliveries expected in the next 4 weeks."
      >
        {upcomingDeliveries.map((item, idx) => (
          <UpcomingDeliveryCard
            key={`delivery-${idx}`}
            item={item}
            onConfirmDelivery={async () => {
              if (!item.order) return;
              await updateOrderStatus(item.order.id, "DELIVERED");
              router.refresh();
            }}
          />
        ))}
      </TodoSection>

      {/* Section 3: Overdue */}
      <TodoSection
        title="Overdue"
        icon={AlertTriangle}
        iconColor="text-red-500"
        count={overdueItems.length}
        emptyMessage="No overdue orders. Everything is on track."
      >
        {overdueItems.map((item, idx) => (
          <OverdueCard
            key={`overdue-${idx}`}
            item={item}
            onMarkDelivered={async () => {
              if (!item.order) return;
              await updateOrderStatus(item.order.id, "DELIVERED");
              router.refresh();
            }}
          />
        ))}
      </TodoSection>

      {/* Section 4: Recently Completed */}
      <TodoSection
        title="Recently Completed"
        icon={CheckCircle}
        iconColor="text-green-500"
        count={recentlyCompleted.length}
        emptyMessage="No orders delivered in the last 2 weeks."
      >
        {recentlyCompleted.map((item, idx) => (
          <CompletedCard key={`completed-${idx}`} item={item} />
        ))}
      </TodoSection>
    </div>
  );
}

// ---------- API Helper ----------

async function updateOrderStatus(orderId: string, status: string) {
  const res = await fetch(`/api/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update order");
}

// ---------- Section Wrapper ----------

function TodoSection({
  title,
  icon: Icon,
  iconColor,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  icon: typeof Package;
  iconColor: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`size-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        {count > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {count}
          </span>
        )}
      </div>

      {count === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

// ---------- Orders to Place Card ----------

function OrderToPlaceCard({ item, onUpdate }: { item: TodoItem; onUpdate: () => void }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function markSent() {
    if (!item.order) return;
    setPending(true);
    try {
      await updateOrderStatus(item.order.id, "ORDERED");
      setSent(true);
      onUpdate();
    } finally {
      setPending(false);
    }
  }

  if (item.type === "order-needed") {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Package className="size-4 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <Link href={`/jobs/${item.jobId}`} className="hover:underline hover:text-blue-600">{item.jobName}</Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Job starts in {item.daysUntilStart} day
              {item.daysUntilStart !== 1 ? "s" : ""} -- no orders placed yet
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <TimingIndicator days={item.daysUntilStart ?? 0} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pending order
  const order = item.order!;
  const mailto = order.supplier.contactEmail
    ? `mailto:${encodeURIComponent(order.supplier.contactEmail)}?subject=${encodeURIComponent(`Material Order — ${item.jobName}`)}&body=${encodeURIComponent(`Hi ${order.supplier.contactName || order.supplier.name},\n\nPlease supply the following for ${item.jobName}:\n\n${order.itemsDescription || "Materials as discussed"}${order.expectedDeliveryDate ? `\n\nRequired by: ${format(new Date(order.expectedDeliveryDate), "dd MMM yyyy")}` : ""}\n\nPlease confirm receipt.\n\nRegards`)}`
    : null;

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
          <Package className="size-4 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {order.supplier.id ? (
              <Link href={`/suppliers/${order.supplier.id}`} className="hover:underline hover:text-blue-600">{order.supplier.name}</Link>
            ) : order.supplier.name}
            {order.orderDetails && (
              <span className="font-normal text-muted-foreground">
                {" "}
                -- {order.orderDetails}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Pending order for{" "}
            <Link href={`/jobs/${item.jobId}`} className="font-medium text-foreground hover:underline hover:text-blue-600">{item.jobName}</Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {sent ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3" /> Sent
            </span>
          ) : pending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {mailto && (
                <Button variant="outline" size="xs"
                  onClick={() => { window.open(mailto, "_blank"); markSent(); }}>
                  <Mail className="size-3" />
                  <span className="hidden sm:inline">Send Order</span>
                </Button>
              )}
              <Button variant="outline" size="xs"
                onClick={markSent}>
                <Package className="size-3" />
                <span className="hidden sm:inline">{mailto ? "Mark Sent" : "Place Order"}</span>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Upcoming Delivery Card ----------

function UpcomingDeliveryCard({
  item,
  onConfirmDelivery,
}: {
  item: TodoItem;
  onConfirmDelivery: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirmDelivery();
    } finally {
      setLoading(false);
    }
  }

  if (!item.order) return null;

  const expectedDate = item.order.expectedDeliveryDate
    ? new Date(item.order.expectedDeliveryDate)
    : null;
  const daysUntil = expectedDate ? differenceInDays(expectedDate, getCurrentDate()) : null;

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
          <Truck className="size-4 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <Link href={`/suppliers/${item.order.supplier.id}`} className="hover:underline hover:text-blue-600">{item.order.supplier.name}</Link>
            {item.order.orderDetails && (
              <span className="font-normal text-muted-foreground">
                {" "}
                -- {item.order.orderDetails}
              </span>
            )}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              For{" "}
              <Link href={`/jobs/${item.jobId}`} className="font-medium text-foreground hover:underline hover:text-blue-600">
                {item.jobName}
              </Link>
            </span>
            {expectedDate && (
              <>
                <span className="text-border">&middot;</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {format(expectedDate, "dd MMM yyyy")}
                  {daysUntil !== null && (
                    <span>
                      ({daysUntil} day{daysUntil !== 1 ? "s" : ""})
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "Confirming..." : "Confirm Delivery"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- Overdue Card ----------

function OverdueCard({
  item,
  onMarkDelivered,
}: {
  item: TodoItem;
  onMarkDelivered: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleMarkDelivered() {
    setLoading("delivered");
    try {
      await onMarkDelivered();
    } finally {
      setLoading(null);
    }
  }

  if (!item.order) return null;

  const chaseMailto = item.order.supplier.contactEmail
    ? `mailto:${encodeURIComponent(item.order.supplier.contactEmail)}?subject=${encodeURIComponent(`Chasing Order — ${item.jobName}`)}&body=${encodeURIComponent(`Hi ${item.order.supplier.contactName || item.order.supplier.name},\n\nI'm chasing the following order which is now ${item.daysOverdue} day${item.daysOverdue !== 1 ? "s" : ""} overdue:\n\n${item.order.itemsDescription || item.order.orderDetails || "Materials as discussed"}\n\nFor: ${item.jobName}\n\nPlease advise on the revised delivery date.\n\nRegards`)}`
    : null;

  return (
    <Card size="sm" className="border-red-200 ring-red-500/20 dark:border-red-900">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle className="size-4 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <Link href={`/suppliers/${item.order.supplier.id}`} className="hover:underline hover:text-blue-600">{item.order.supplier.name}</Link>
            {item.order.orderDetails && (
              <span className="font-normal text-muted-foreground">
                {" "}
                -- {item.order.orderDetails}
              </span>
            )}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <span className="font-medium text-red-600 dark:text-red-400">
              {item.daysOverdue} day{item.daysOverdue !== 1 ? "s" : ""} overdue
            </span>
            <span className="text-border">&middot;</span>
            <span className="text-muted-foreground">
              For{" "}
              <Link href={`/jobs/${item.jobId}`} className="font-medium text-foreground hover:underline hover:text-blue-600">
                {item.jobName}
              </Link>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={handleMarkDelivered}
            disabled={loading !== null}
          >
            {loading === "delivered" ? "Updating..." : "Mark Delivered"}
          </Button>
          {chaseMailto && (
            <Button
              variant="ghost"
              size="xs"
              className="text-amber-600"
              onClick={() => window.open(chaseMailto, "_blank")}
            >
              Chase Supplier
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Completed Card ----------

function CompletedCard({ item }: { item: TodoItem }) {
  if (!item.order) return null;

  const deliveredDate = item.order.deliveredDate
    ? new Date(item.order.deliveredDate)
    : null;

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
          <CheckCircle className="size-4 text-green-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <Link href={`/suppliers/${item.order.supplier.id}`} className="hover:underline hover:text-blue-600">{item.order.supplier.name}</Link>
            {item.order.orderDetails && (
              <span className="font-normal text-muted-foreground">
                {" "}
                -- {item.order.orderDetails}
              </span>
            )}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              For{" "}
              <Link href={`/jobs/${item.jobId}`} className="font-medium text-foreground hover:underline hover:text-blue-600">
                {item.jobName}
              </Link>
            </span>
            {deliveredDate && (
              <>
                <span className="text-border">&middot;</span>
                <span>Delivered {format(deliveredDate, "dd MMM yyyy")}</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Timing Indicator ----------

function TimingIndicator({ days }: { days: number }) {
  let color = "bg-green-500";
  if (days <= 7) {
    color = "bg-red-500";
  } else if (days <= 14) {
    color = "bg-amber-500";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${color}`}
    >
      {days}d
    </span>
  );
}
