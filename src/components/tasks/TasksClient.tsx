"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { format, isBefore, isSameDay, differenceInDays } from "date-fns";
import { getCurrentDate, getCurrentDateAtMidnight } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  ClipboardList,
  Truck,
  Send,
  CheckCircle,
  Calendar,
  Loader2,
  AlertTriangle,
  ArrowRight,
  OctagonX,
  Mail,
  CircleCheck,
  Square,
  Clock,
  Play,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDelayJob } from "@/hooks/useDelayJob";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { useOrderEmail } from "@/hooks/useOrderEmail";

// ---------- Types ----------

interface OrderTask {
  id: string;
  status: string;
  expectedDeliveryDate: string | null;
  dateOfOrder: string;
  itemsDescription: string | null;
  supplier: {
    id: string;
    name: string;
    contactEmail?: string | null;
    contactName?: string | null;
    accountNumber?: string | null;
  };
  job: {
    id: string;
    name: string;
    plot: {
      id: string;
      name: string;
      plotNumber?: string | null;
      site: {
        id: string;
        name: string;
        address?: string | null;
        postcode?: string | null;
      };
    };
  };
  orderItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    unitCost?: number;
  }>;
}

interface JobTask {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  plot: {
    id: string;
    name: string;
    site: { id: string; name: string };
  };
  assignedTo?: { id: string; name: string } | null;
}

interface TaskData {
  confirmDelivery: OrderTask[];
  sendOrder: OrderTask[];
  signOffJobs: JobTask[];
  overdueJobs: JobTask[];
  lateStartJobs: JobTask[];
  overdueOrders: OrderTask[];
  awaitingDelivery: OrderTask[];
  upcomingJobs: JobTask[];
  upcomingDeliveries: OrderTask[];
  counts: {
    confirmDelivery: number;
    sendOrder: number;
    signOffJobs: number;
    overdueJobs: number;
    lateStartJobs: number;
    overdueOrders: number;
    awaitingDelivery: number;
    upcoming: number;
  };
}

interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  contactEmail: string | null;
  contactName: string | null;
  orders: OrderTask[];
  sites: string[];
}

// ---------- Urgency ----------

function getUrgency(dateStr: string | null): "overdue" | "today" | "upcoming" {
  if (!dateStr) return "upcoming";
  const d = new Date(dateStr);
  // Midnight-snap so SSR and hydration agree on categorisation.
  const now = getCurrentDateAtMidnight();
  if (isBefore(d, now) && !isSameDay(d, now)) return "overdue";
  if (isSameDay(d, now)) return "today";
  return "upcoming";
}

function daysOverdue(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, differenceInDays(getCurrentDate(), new Date(dateStr)));
}

const urgencyColors = {
  overdue: "bg-red-50 border-red-200 text-red-700",
  today: "bg-amber-50 border-amber-200 text-amber-700",
  upcoming: "bg-blue-50 border-blue-200 text-blue-700",
};

const urgencyBadge = {
  overdue: "bg-red-100 text-red-700",
  today: "bg-amber-100 text-amber-700",
  upcoming: "bg-blue-100 text-blue-700",
};

// ---------- Component ----------

export function TasksClient() {
  const router = useRouter();
  const { devDate } = useDevDate();
  const [data, setData] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [sendingGroupIds, setSendingGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [devDate, refreshKey]);

  // ── Group send orders by supplier ──
  const supplierGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, SupplierGroup>();
    for (const order of data.sendOrder) {
      const existing = map.get(order.supplier.id);
      if (existing) {
        existing.orders.push(order);
        const siteName = order.job.plot.site.name;
        if (!existing.sites.includes(siteName)) {
          existing.sites.push(siteName);
        }
      } else {
        map.set(order.supplier.id, {
          supplierId: order.supplier.id,
          supplierName: order.supplier.name,
          contactEmail: order.supplier.contactEmail ?? null,
          contactName: order.supplier.contactName ?? null,
          orders: [order],
          sites: [order.job.plot.site.name],
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.orders[0].dateOfOrder).getTime() -
        new Date(b.orders[0].dateOfOrder).getTime()
    );
  }, [data]);

  // ── Quick confirm delivery — delegated to useOrderStatus hook ──
  const { setOrderStatus, isPending: isOrderPending } = useOrderStatus();

  async function handleQuickConfirm(orderId: string, listKey: "confirmDelivery" | "overdueOrders" | "awaitingDelivery") {
    const result = await setOrderStatus(orderId, "DELIVERED");
    if (result.ok && data) {
      setData({
        ...data,
        [listKey]: (data[listKey] as OrderTask[]).filter((o) => o.id !== orderId),
        counts: {
          ...data.counts,
          [listKey]: (data.counts[listKey as keyof typeof data.counts] as number) - 1,
        },
      });
    }
  }

  // ── Quick stop job ──
  async function handleStopJob(jobId: string) {
    setStoppingIds((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", notes: "Stopped from tasks — overdue" }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Failed to stop job:", err);
    } finally {
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  // ── Delay job ──
  // Unified via useDelayJob — replaces the prior ~80 lines of bespoke
  // dialog state + Dialog JSX. Keeps the Tasks page consistent with
  // Daily Brief / Walkthrough / JobWeekPanel: both input modes (days OR
  // new end date), rain/temperature/other reason picker, AND weather
  // auto-suggestion (lives inside useDelayJob now).
  const { openDelayDialog, dialogs: delayDialogs } = useDelayJob(() => {
    setRefreshKey((k) => k + 1);
  });

  // ── Chase + Send order email (unified via useOrderEmail) ──
  // The hook owns the dialog, mailto, event log, and (for send mode) the
  // mark-as-ORDERED status update. onSent fires after the user hits send
  // so we refresh the task list to drop the cleared items.
  const { openSendOrderEmail, openChaseOrderEmail, dialogs: emailDialogs } = useOrderEmail(() => {
    setRefreshKey((k) => k + 1);
  });

  function openChaseDialog(order: OrderTask) {
    openChaseOrderEmail({
      orderId: order.id,
      supplierName: order.supplier.name,
      supplierContactName: order.supplier.contactName ?? null,
      supplierContactEmail: order.supplier.contactEmail ?? null,
      supplierAccountNumber: order.supplier.accountNumber ?? null,
      jobId: order.job.id,
      jobName: order.job.name,
      plotName: order.job.plot.name,
      plotNumber: order.job.plot.plotNumber ?? null,
      siteId: order.job.plot.site.id,
      siteName: order.job.plot.site.name,
      siteAddress: order.job.plot.site.address ?? null,
      sitePostcode: order.job.plot.site.postcode ?? null,
      itemsDescription: order.itemsDescription ?? null,
      items: order.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
      expectedDeliveryDate: order.expectedDeliveryDate,
      daysOverdue: daysOverdue(order.expectedDeliveryDate),
    });
  }

  function openSendOrderDialogForGroup(group: SupplierGroup) {
    openSendOrderEmail({
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      contactName: group.contactName,
      contactEmail: group.contactEmail,
      // Pick account number off the first order's supplier (all share the same supplier in a group)
      accountNumber: group.orders[0]?.supplier.accountNumber ?? null,
      orders: group.orders.map((o) => ({
        id: o.id,
        job: {
          id: o.job.id,
          name: o.job.name,
          plot: {
            name: o.job.plot.name,
            plotNumber: o.job.plot.plotNumber ?? null,
            site: {
              id: o.job.plot.site.id,
              name: o.job.plot.site.name,
              address: o.job.plot.site.address ?? null,
              postcode: o.job.plot.site.postcode ?? null,
            },
          },
        },
        expectedDeliveryDate: o.expectedDeliveryDate,
        dateOfOrder: o.dateOfOrder,
        itemsDescription: o.itemsDescription ?? null,
        items: o.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
      })),
      siteNames: group.sites,
    });
  }

  // ── Mark a whole supplier group as ORDERED ──
  async function handleMarkGroupSent(group: SupplierGroup) {
    const supplierId = group.supplierId;
    setSendingGroupIds((prev) => new Set(prev).add(supplierId));
    try {
      const orderIds = group.orders.map((o) => o.id);
      const res = await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, status: "ORDERED" }),
      });
      if (res.ok && data) {
        const remainingOrders = data.sendOrder.filter(
          (o) => !orderIds.includes(o.id)
        );
        setData({
          ...data,
          sendOrder: remainingOrders,
          counts: {
            ...data.counts,
            sendOrder: remainingOrders.length,
          },
        });
      }
    } catch (err) {
      console.error("Failed to mark group as sent:", err);
    } finally {
      setSendingGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(supplierId);
        return next;
      });
    }
  }

  // handleSendGroupOrderEmail is gone — useOrderEmail owns mailto + event
  // log + mark-as-ORDERED now, and the onSent callback refreshes the
  // task list so the cleared orders disappear.

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Failed to load tasks.
      </p>
    );
  }

  const totalActions =
    data.counts.confirmDelivery +
    data.counts.sendOrder +
    data.counts.signOffJobs +
    data.counts.overdueJobs +
    data.counts.lateStartJobs +
    data.counts.overdueOrders;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Tasks" },
      ]} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalActions > 0
            ? `${totalActions} action${totalActions !== 1 ? "s" : ""} require your attention`
            : "All caught up! No pending actions."}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
        <SummaryCard
          icon={Truck}
          label="Confirm Delivery"
          count={data.counts.confirmDelivery}
          color="text-green-600"
          bgColor="bg-green-50"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Overdue Materials"
          count={data.counts.overdueOrders}
          color="text-red-600"
          bgColor="bg-red-50"
        />
        <SummaryCard
          icon={OctagonX}
          label="Overdue Jobs"
          count={data.counts.overdueJobs}
          color="text-red-600"
          bgColor="bg-red-50"
        />
        <SummaryCard
          icon={Clock}
          label="Late Start"
          count={data.counts.lateStartJobs}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
        <SummaryCard
          icon={CheckCircle}
          label="Sign Off Jobs"
          count={data.counts.signOffJobs}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <SummaryCard
          icon={Send}
          label="Send Order"
          count={data.counts.sendOrder}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <SummaryCard
          icon={Package}
          label="Awaiting Delivery"
          count={data.counts.awaitingDelivery}
          color="text-purple-600"
          bgColor="bg-purple-50"
        />
        <SummaryCard
          icon={Calendar}
          label="Upcoming"
          count={data.counts.upcoming}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
        />
      </div>

      {/* ── Overdue Materials Section ── */}
      {data.overdueOrders.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-600" />
              <CardTitle>Overdue Materials</CardTitle>
            </div>
            <CardDescription>
              Orders past their expected delivery date — confirm or chase supplier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.overdueOrders.map((order) => {
                const days = daysOverdue(order.expectedDeliveryDate);
                const isConfirming = isOrderPending(order.id);
                return (
                  <div
                    key={order.id}
                    className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/jobs/${order.job.id}`)}
                    >
                      <p className="text-sm font-medium text-red-800">
                        <Link
                          href={`/suppliers/${order.supplier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {order.supplier.name}
                        </Link>
                      </p>
                      <p className="text-xs text-red-600">
                        {order.job.plot.site.name} &bull; {order.job.plot.name} &bull; {order.job.name}
                      </p>
                      {order.itemsDescription && (
                        <p className="mt-0.5 truncate text-xs text-red-500">
                          {order.itemsDescription}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      {days}d overdue
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                      disabled={isConfirming}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickConfirm(order.id, "overdueOrders");
                      }}
                      title="Confirm delivery received"
                    >
                      {isConfirming ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CircleCheck className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">Confirm</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        openChaseDialog(order);
                      }}
                      title="Chase supplier via email"
                    >
                      <Mail className="size-3.5" />
                      <span className="hidden sm:inline">Chase</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Overdue Jobs Section ── */}
      {data.overdueJobs.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <OctagonX className="size-4 text-red-600" />
              <CardTitle>Overdue Jobs</CardTitle>
            </div>
            <CardDescription>
              In-progress jobs past their planned end date — stop or sign off
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.overdueJobs.map((job) => {
                const days = daysOverdue(job.endDate);
                const isStopping = stoppingIds.has(job.id);
                return (
                  <div
                    key={job.id}
                    className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/jobs/${job.id}`)}
                    >
                      <p className="text-sm font-medium text-red-800">
                        {job.name}
                      </p>
                      <p className="text-xs text-red-600">
                        {job.plot.site.name} &bull; {job.plot.name}
                        {job.assignedTo && ` — ${job.assignedTo.name}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      {days}d overdue
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                      disabled={isStopping}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStopJob(job.id);
                      }}
                      title="Put job on hold"
                    >
                      {isStopping ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Square className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">Stop</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDelayDialog(job);
                      }}
                      title="Delay this job"
                    >
                      <Clock className="size-3.5" />
                      <span className="hidden sm:inline">Delay</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/jobs/${job.id}`);
                      }}
                      title="Go to job to sign off"
                    >
                      <CheckCircle className="size-3.5" />
                      <span className="hidden sm:inline">Sign Off</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Late Start Jobs Section ── */}
      {data.lateStartJobs.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-orange-600" />
              <CardTitle>Late Start</CardTitle>
            </div>
            <CardDescription>
              Jobs that should have started but haven&apos;t been kicked off yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.lateStartJobs.map((job) => {
                const days = daysOverdue(job.startDate);
                return (
                  <button
                    key={job.id}
                    className="flex w-full items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3 text-left transition-colors hover:bg-orange-100/80"
                    onClick={() => router.push(`/jobs/${job.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-orange-800">
                        {job.name}
                      </p>
                      <p className="text-xs text-orange-600">
                        {job.plot.site.name} &bull; {job.plot.name}
                        {job.assignedTo && ` — ${job.assignedTo.name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                        {days}d late
                      </span>
                      <ArrowRight className="size-4 text-orange-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm Delivery Section ── */}
      {data.confirmDelivery.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-green-600" />
              <CardTitle>Confirm Delivery</CardTitle>
            </div>
            <CardDescription>
              Orders expected to be delivered — confirm receipt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.confirmDelivery.map((order) => {
                const urgency = getUrgency(order.expectedDeliveryDate);
                const isConfirming = isOrderPending(order.id);
                return (
                  <div
                    key={order.id}
                    className={`flex w-full items-center gap-2 rounded-lg border p-3 ${urgencyColors[urgency]}`}
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/jobs/${order.job.id}`)}
                    >
                      <p className="text-sm font-medium">
                        <Link
                          href={`/suppliers/${order.supplier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {order.supplier.name}
                        </Link>
                      </p>
                      <p className="text-xs opacity-75">
                        {order.job.plot.site.name} &bull; {order.job.plot.name}{" "}
                        &bull; {order.job.name}
                      </p>
                      {order.itemsDescription && (
                        <p className="mt-0.5 truncate text-xs opacity-60">
                          {order.itemsDescription}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyBadge[urgency]}`}
                    >
                      {urgency === "today"
                        ? "Today"
                        : order.expectedDeliveryDate
                          ? format(new Date(order.expectedDeliveryDate), "dd MMM")
                          : "No date"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                      disabled={isConfirming}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickConfirm(order.id, "confirmDelivery");
                      }}
                      title="Confirm delivery received"
                    >
                      {isConfirming ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CircleCheck className="size-3.5" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Send Order Section (grouped by supplier) ── */}
      {supplierGroups.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="size-4 text-blue-600" />
              <CardTitle>Send Orders</CardTitle>
            </div>
            <CardDescription>
              {data.counts.sendOrder} order{data.counts.sendOrder !== 1 ? "s" : ""} across {supplierGroups.length} supplier{supplierGroups.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {supplierGroups.map((group) => {
                const isGroupSending = sendingGroupIds.has(group.supplierId);
                const plotNames = [...new Set(group.orders.map((o) => o.job.plot.name))];
                // Aggregate items across all orders in the group
                const itemMap = new Map<string, { name: string; unit: string; quantity: number }>();
                for (const order of group.orders) {
                  for (const item of order.orderItems) {
                    const key = `${item.name}|||${item.unit}`;
                    const ex = itemMap.get(key);
                    if (ex) {
                      ex.quantity += item.quantity;
                    } else {
                      itemMap.set(key, { name: item.name, unit: item.unit, quantity: item.quantity });
                    }
                  }
                }
                const aggregatedItems = Array.from(itemMap.values());

                return (
                  <div
                    key={group.supplierId}
                    className="rounded-lg border border-blue-200/50 bg-blue-50/50 p-3"
                  >
                    {/* Supplier header with actions */}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{group.supplierName}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.sites.join(", ")} &bull; {plotNames.join(", ")}
                          {group.orders.length > 1 && (
                            <span className="ml-1 text-blue-600">
                              ({group.orders.length} orders)
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        onClick={() => openSendOrderDialogForGroup(group)}
                        title="Send order to supplier via email"
                      >
                        <Mail className="size-3.5" />
                        <span className="hidden sm:inline">Send Order</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                        disabled={isGroupSending}
                        onClick={() => handleMarkGroupSent(group)}
                        title="Mark all as ordered without sending email"
                      >
                        {isGroupSending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CircleCheck className="size-3.5" />
                        )}
                        <span className="hidden sm:inline">Mark Sent</span>
                      </Button>
                    </div>

                    {/* Aggregated items list */}
                    {aggregatedItems.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {aggregatedItems.map((item, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} {item.name}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Individual order sub-rows (clickable to job) */}
                    {group.orders.length > 1 && (
                      <div className="mt-2 space-y-1 border-t border-blue-200/30 pt-2">
                        {group.orders.map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer hover:bg-blue-100/50 transition-colors"
                            onClick={() => router.push(`/jobs/${order.job.id}`)}
                          >
                            <span className="min-w-0 flex-1 text-muted-foreground">
                              {order.job.plot.name} &bull; {order.job.name}
                            </span>
                            <span className="shrink-0 text-blue-600">
                              {format(new Date(order.dateOfOrder), "dd MMM")}
                            </span>
                            <ArrowRight className="size-3 text-muted-foreground/50" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Awaiting Delivery Section ── */}
      {data.awaitingDelivery.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="size-4 text-purple-600" />
              <CardTitle>Awaiting Delivery</CardTitle>
            </div>
            <CardDescription>
              Orders sent to suppliers — waiting for delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.awaitingDelivery.map((order) => {
                const isConfirming = isOrderPending(order.id);
                return (
                  <div
                    key={order.id}
                    className="flex w-full items-center gap-2 rounded-lg border bg-purple-50/50 border-purple-200/50 p-3"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/jobs/${order.job.id}`)}
                    >
                      <p className="text-sm font-medium">
                        <Link
                          href={`/suppliers/${order.supplier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {order.supplier.name}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.job.plot.site.name} &bull; {order.job.plot.name}{" "}
                        &bull; {order.job.name}
                      </p>
                      {order.orderItems.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {order.orderItems
                            .map((item) => `${item.quantity} ${item.unit} ${item.name}`)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                      {order.expectedDeliveryDate
                        ? format(new Date(order.expectedDeliveryDate), "dd MMM")
                        : "No date"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                      disabled={isConfirming}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickConfirm(order.id, "awaitingDelivery");
                      }}
                      title="Confirm delivery received"
                    >
                      {isConfirming ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CircleCheck className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">Confirm</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sign Off Jobs Section ── */}
      {data.signOffJobs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-amber-600" />
              <CardTitle>Sign Off Jobs</CardTitle>
            </div>
            <CardDescription>
              In-progress jobs approaching their end date
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.signOffJobs.map((job) => {
                const urgency = getUrgency(job.endDate);
                return (
                  <button
                    key={job.id}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${urgencyColors[urgency]}`}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{job.name}</p>
                      <p className="text-xs opacity-75">
                        {job.plot.site.name} &bull; {job.plot.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyBadge[urgency]}`}
                      >
                        {urgency === "today"
                          ? "Due today"
                          : job.endDate
                            ? `Due ${format(new Date(job.endDate), "dd MMM")}`
                            : "No date"}
                      </span>
                      <ArrowRight className="size-4 opacity-40" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Upcoming Section ── */}
      {(data.upcomingJobs.length > 0 || data.upcomingDeliveries.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-indigo-600" />
              <CardTitle>Upcoming (Next 7 Days)</CardTitle>
            </div>
            <CardDescription>
              Job starts and deliveries coming up
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.upcomingJobs.map((job) => (
                <button
                  key={`job-${job.id}`}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Job Start
                      </Badge>
                      <p className="text-sm font-medium">{job.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.plot.site.name} &bull; {job.plot.name}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {job.startDate && format(new Date(job.startDate), "dd MMM")}
                  </span>
                </button>
              ))}
              {data.upcomingDeliveries.map((order) => (
                <button
                  key={`del-${order.id}`}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
                  onClick={() => router.push(`/jobs/${order.job.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-green-300 text-green-700"
                      >
                        Delivery
                      </Badge>
                      <p className="text-sm font-medium">
                        <Link href={`/suppliers/${order.supplier.id}`} className="hover:underline">
                          {order.supplier.name}
                        </Link>
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {order.job.plot.site.name} &bull; {order.job.plot.name} &bull;{" "}
                      {order.job.name}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {order.expectedDeliveryDate &&
                      format(new Date(order.expectedDeliveryDate), "dd MMM")}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totalActions === 0 && data.counts.upcoming === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-green-100 p-4">
              <CheckCircle className="size-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">All caught up!</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No pending tasks or upcoming items for the next 7 days.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Shared supplier-email dialog (useOrderEmail) — one dialog for
          both Chase (overdue) and Send Order (bulk) flows. */}
      {emailDialogs}

      {/* Unified delay dialog (useDelayJob) — same UX as Daily Brief, Walkthrough,
          and JobWeekPanel. Both input modes + reason picker live in one place. */}
      {delayDialogs}
    </div>
  );
}

// ---------- Summary Card ----------

function SummaryCard({
  icon: Icon,
  label,
  count,
  color,
  bgColor,
}: {
  icon: typeof ClipboardList;
  label: string;
  count: number;
  color: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${bgColor}`}>
            <Icon className={`size-4 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
