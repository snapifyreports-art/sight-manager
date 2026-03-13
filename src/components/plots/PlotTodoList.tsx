"use client";

import { useState } from "react";
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
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ---------- Types ----------

interface OrderData {
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
  await fetch(`/api/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
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

function OrderToPlaceCard({ item }: { item: TodoItem }) {
  if (item.type === "order-needed") {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Package className="size-4 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.jobName}</p>
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
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
          <Package className="size-4 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.order?.supplier.name}
            {item.order?.orderDetails && (
              <span className="font-normal text-muted-foreground">
                {" "}
                -- {item.order.orderDetails}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Pending order for{" "}
            <span className="font-medium text-foreground">{item.jobName}</span>
          </p>
        </div>
        <Button variant="outline" size="xs">
          Send Order
          <ArrowRight className="size-3" data-icon="inline-end" />
        </Button>
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
            {item.order.supplier.name}
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
              <span className="font-medium text-foreground">
                {item.jobName}
              </span>
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

  return (
    <Card size="sm" className="border-red-200 ring-red-500/20 dark:border-red-900">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
          <AlertTriangle className="size-4 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.order.supplier.name}
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
              <span className="font-medium text-foreground">
                {item.jobName}
              </span>
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
          <Button variant="ghost" size="xs" className="text-amber-600">
            Chase Supplier
          </Button>
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
            {item.order.supplier.name}
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
              <span className="font-medium text-foreground">
                {item.jobName}
              </span>
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
