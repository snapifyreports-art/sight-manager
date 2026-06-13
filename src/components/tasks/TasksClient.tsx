"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { usePullForwardDecision } from "@/hooks/usePullForwardDecision";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { useOrderEmail } from "@/hooks/useOrderEmail";
import { useJobAction } from "@/hooks/useJobAction";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";

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
  // (Jun 2026 audit) MaterialOrder.jobId is nullable — one-off orders
  // attach directly to a plot or the site instead. Consumers must
  // null-check `job` and fall back to the plot/site attachment.
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
  } | null;
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
  } | null;
  site: {
    id: string;
    name: string;
    address?: string | null;
    postcode?: string | null;
  } | null;
  orderItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    unitCost?: number;
  }>;
}

// (Jun 2026 audit) Null-safe labels for one-off orders — mirrors
// orderJobLabel/orderPlotLabel in
// src/components/reports/daily-brief/types.ts so a job-less order
// renders "One-off order · Plot 3" instead of crashing on
// `order.job.plot.site.name` (which took down the whole /tasks page).
function orderJobLabel(o: OrderTask): string {
  return o.job ? o.job.name : "One-off order";
}

function orderPlotLabel(o: OrderTask): string {
  const plot = o.job?.plot ?? o.plot;
  if (plot) return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
  return o.site ? "Site-wide" : "—";
}

function orderSite(o: OrderTask) {
  return o.job?.plot.site ?? o.plot?.site ?? o.site ?? null;
}

function orderSiteName(o: OrderTask): string {
  return orderSite(o)?.name ?? "—";
}

/** Where a click on the order row should land — the job page when a job
 *  exists, otherwise the owning site's Orders tab (one-offs live there). */
function orderHref(o: OrderTask): string | null {
  if (o.job) return `/jobs/${o.job.id}`;
  const site = orderSite(o);
  return site ? `/sites/${site.id}?tab=orders` : null;
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
  // Group key is supplier + dateOfOrder so each "batch" is a distinct
  // email — matches Keith's just-in-time workflow. Two batches to the
  // same supplier on different dates are two separate emails, sent at
  // their respective times, not lumped into one over-early order.
  key: string;
  supplierId: string;
  supplierName: string;
  contactEmail: string | null;
  contactName: string | null;
  orderDateISO: string;  // YYYY-MM-DD for display + grouping
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
  // Centralised job action flow — reuses the stop-reason dialog from useJobAction
  // so the decision is captured at the moment of stopping, not inferred later.
  const { triggerAction: triggerJobAction, isLoading: jobActionLoading, dialogs: jobActionDialogs } = useJobAction(() => {
    setRefreshKey((k) => k + 1);
  });
  const [sendingGroupIds, setSendingGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    // (May 2026 pattern sweep) Guard with .ok — pre-fix an error payload
    // landed in `data` and crashed the downstream renderers.
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [devDate, refreshKey]);

  // ── Group send orders by supplier + dateOfOrder (JIT batch) ──
  // Keith Apr 2026: "its confusing because we're running just-in-time".
  // An order with dateOfOrder=20 Apr and another with dateOfOrder=27 Apr
  // are two separate emails, sent on two separate days. Previously this
  // lumped them into one card which prompted sending everything early
  // and breaks the JIT model.
  const supplierGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, SupplierGroup>();
    for (const order of data.sendOrder) {
      const dateKey = order.dateOfOrder.slice(0, 10); // YYYY-MM-DD
      const key = `${order.supplier.id}__${dateKey}`;
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(order);
        const siteName = orderSiteName(order);
        if (!existing.sites.includes(siteName)) {
          existing.sites.push(siteName);
        }
      } else {
        map.set(key, {
          key,
          supplierId: order.supplier.id,
          supplierName: order.supplier.name,
          contactEmail: order.supplier.contactEmail ?? null,
          contactName: order.supplier.contactName ?? null,
          orderDateISO: dateKey,
          orders: [order],
          sites: [orderSiteName(order)],
        });
      }
    }
    // Sort: earliest dateOfOrder first (most urgent to send).
    return Array.from(map.values()).sort(
      (a, b) => a.orderDateISO.localeCompare(b.orderDateISO)
    );
  }, [data]);

  // ── Quick confirm delivery — delegated to useOrderStatus hook ──
  const { setOrderStatus, setManyOrderStatus, isPending: isOrderPending } = useOrderStatus();

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

  // Stop now delegated to useJobAction.triggerAction — opens the shared
  // reason-capture dialog, so stopping from Tasks behaves identically to
  // stopping from Jobs / JobDetail / Programme.

  // ── Delay job ──
  // Unified via useDelayJob — replaces the prior ~80 lines of bespoke
  // dialog state + Dialog JSX. Keeps the Tasks page consistent with
  // Daily Brief / Walkthrough / JobWeekPanel: both input modes (days OR
  // new end date), rain/temperature/other reason picker, AND weather
  // auto-suggestion (lives inside useDelayJob now).
  const { openDelayDialog, dialogs: delayDialogs } = useDelayJob(() => {
    setRefreshKey((k) => k + 1);
  });

  // ── Pull forward ── same surfaces as Delay. Unified hook.
  const { openPullForwardDialog, dialogs: pullForwardDialogs } = usePullForwardDecision(() => {
    setRefreshKey((k) => k + 1);
  });

  // (Jun 2026 R25) When a supplier-date batch spans MULTIPLE sites, the
  // order splits into one email per site — each site gets its own ORDERED
  // batch. useOrderEmail drives a single-draft dialog, so we queue the
  // remaining per-site emails here and open the next one after each send.
  const siteEmailQueue = useRef<import("@/hooks/useOrderEmail").SendOrderGroupInput[]>([]);

  // ── Chase + Send order email (unified via useOrderEmail) ──
  // The hook owns the dialog, mailto, event log, and (for send mode) the
  // mark-as-ORDERED status update. onSent fires after the user hits send
  // so we refresh the task list to drop the cleared items.
  const { openSendOrderEmail, openChaseOrderEmail, dialogs: emailDialogs } = useOrderEmail((mode) => {
    // (Jun 2026 R25) After a send, open the next queued per-site email (if
    // this batch spanned multiple sites). Refresh only once the queue is
    // drained so the cleared orders disappear from every site's list.
    if (mode === "send" && siteEmailQueue.current.length > 0) {
      const next = siteEmailQueue.current.shift()!;
      // Defer so the just-closed dialog fully unmounts before reopening.
      setTimeout(() => openSendOrderEmail(next), 150);
      return;
    }
    setRefreshKey((k) => k + 1);
  });

  function openChaseDialog(order: OrderTask) {
    // (Jun 2026 audit) Null-safe for one-off orders — fall back to the
    // direct plot/site attachment and omit the jobId (no real Job FK).
    const site = orderSite(order);
    const plot = order.job?.plot ?? order.plot;
    openChaseOrderEmail({
      orderId: order.id,
      supplierName: order.supplier.name,
      supplierContactName: order.supplier.contactName ?? null,
      supplierContactEmail: order.supplier.contactEmail ?? null,
      supplierAccountNumber: order.supplier.accountNumber ?? null,
      jobId: order.job?.id ?? null,
      jobName: orderJobLabel(order),
      plotName: plot?.name ?? "Site-wide",
      plotNumber: plot?.plotNumber ?? null,
      siteId: site?.id ?? "",
      siteName: site?.name ?? "",
      siteAddress: site?.address ?? null,
      sitePostcode: site?.postcode ?? null,
      itemsDescription: order.itemsDescription ?? null,
      items: order.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
      expectedDeliveryDate: order.expectedDeliveryDate,
      daysOverdue: daysOverdue(order.expectedDeliveryDate),
    });
  }

  // (Jun 2026 R25) Build a SendOrderGroupInput for a single site's slice of
  // a supplier batch. The hook marks exactly these order ids ORDERED.
  function buildSiteEmailInput(
    group: SupplierGroup,
    orders: OrderTask[],
    siteName: string,
  ): import("@/hooks/useOrderEmail").SendOrderGroupInput {
    return {
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      contactName: group.contactName,
      contactEmail: group.contactEmail,
      // Pick account number off the first order's supplier (all share the same supplier in a group)
      accountNumber: orders[0]?.supplier.accountNumber ?? null,
      orders: orders.map((o) => {
        // (Jun 2026 audit) One-off orders carry no job — fall back to the
        // direct plot/site attachment. useOrderEmail already supports
        // omitting job.id for one-offs (audit jobId only when real).
        const plot = o.job?.plot ?? o.plot;
        const site = orderSite(o);
        return {
          id: o.id,
          job: {
            ...(o.job ? { id: o.job.id } : {}),
            name: orderJobLabel(o),
            plot: {
              name: plot?.name ?? "Site-wide",
              plotNumber: plot?.plotNumber ?? null,
              site: {
                id: site?.id ?? "",
                name: site?.name ?? "",
                address: site?.address ?? null,
                postcode: site?.postcode ?? null,
              },
            },
          },
          expectedDeliveryDate: o.expectedDeliveryDate,
          dateOfOrder: o.dateOfOrder,
          itemsDescription: o.itemsDescription ?? null,
          items: o.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
        };
      }),
      siteNames: [siteName],
    };
  }

  function openSendOrderDialogForGroup(group: SupplierGroup) {
    // (Jun 2026 R25) Partition the batch by site. A supplier delivering to
    // two sites on the same order date gets two emails (each addressed with
    // its own site name/address and marking only that site's orders ORDERED)
    // — a single email mixing sites would put the wrong delivery address on
    // half the lines and over-mark on send.
    const bySite = new Map<string, { siteName: string; orders: OrderTask[] }>();
    for (const o of group.orders) {
      const site = orderSite(o);
      const siteKey = site?.id ?? "__no-site__";
      const siteName = site?.name ?? "—";
      const bucket = bySite.get(siteKey);
      if (bucket) bucket.orders.push(o);
      else bySite.set(siteKey, { siteName, orders: [o] });
    }

    const buckets = Array.from(bySite.values());
    const inputs = buckets.map((b) => buildSiteEmailInput(group, b.orders, b.siteName));

    // Open the first site's email immediately; queue the rest so each one
    // opens after the previous is sent (see the useOrderEmail onSent above).
    siteEmailQueue.current = inputs.slice(1);
    if (inputs.length > 0) openSendOrderEmail(inputs[0]);
  }

  // ── Mark a whole supplier-date batch as ORDERED ──
  // Uses the composite group.key (supplier + dateOfOrder) for the pending
  // state so two batches to the same supplier on different dates show
  // their spinners independently.
  // (Jun 2026 audit) Routed through useOrderStatus.setManyOrderStatus —
  // the same hardened path the Send-Order email button uses. The old
  // /api/orders/bulk-status call bypassed the combined late-send popup,
  // never re-stamped dateOfOrder on PENDING→ORDERED (so supplier
  // performance / Story "sent" events read the PLANNED date), and
  // skipped the order-date invariants. The hook handles toasts.
  async function handleMarkGroupSent(group: SupplierGroup) {
    const stateKey = group.key;
    setSendingGroupIds((prev) => new Set(prev).add(stateKey));
    try {
      const orderIds = group.orders.map((o) => o.id);
      const { ok } = await setManyOrderStatus(orderIds, "ORDERED");
      if (ok.length > 0 && data) {
        const sentIds = new Set(ok);
        const remainingOrders = data.sendOrder.filter((o) => !sentIds.has(o.id));
        setData({
          ...data,
          sendOrder: remainingOrders,
          counts: {
            ...data.counts,
            sendOrder: remainingOrders.length,
          },
        });
      }
    } finally {
      setSendingGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(stateKey);
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
        { label: "Daily Brief", href: "/daily-brief" },
        { label: "All Sites" },
      ]} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Brief — All Sites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalActions > 0
            ? `${totalActions} action${totalActions !== 1 ? "s" : ""} need your attention across every site you can see. Use the site picker above to focus on one.`
            : "All caught up across every site. Use the site picker above to dig into one."}
        </p>
      </div>

      {/* (May 2026 Keith request) Lateness summary across every
          accessible site. Auto-expands when there are events still
          needing a reason so the unattributed ones surface here
          immediately — the per-site Daily Brief has the same widget
          scoped to its own site, and the goal of having it at the
          all-sites view too is that nothing gets lost between sites. */}
      <LatenessSummary status="open" />

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
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => { const href = orderHref(order); if (href) router.push(href); }}
                    >
                      <p className="truncate text-sm font-medium text-red-800">
                        <Link
                          href={`/suppliers/${order.supplier.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {order.supplier.name}
                        </Link>
                      </p>
                      <p className="truncate text-xs text-red-600">
                        {orderSiteName(order)} &bull; {orderPlotLabel(order)} &bull; {orderJobLabel(order)}
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
                      <span>Confirm</span>
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
                      <span>Chase</span>
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
                return (
                  <div
                    key={job.id}
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
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
                      disabled={jobActionLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Opens shared stop-reason dialog from useJobAction
                        triggerJobAction(
                          { id: job.id, name: job.name, status: "IN_PROGRESS", startDate: job.startDate, endDate: job.endDate },
                          "stop"
                        );
                      }}
                      title="Put job on hold"
                    >
                      {jobActionLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Square className="size-3.5" />
                      )}
                      <span>Stop</span>
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
                      <span>Delay</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPullForwardDialog(job);
                      }}
                      title="Pull this job forward"
                    >
                      <Clock className="size-3.5" />
                      <span>Pull</span>
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
                      <span>Sign Off</span>
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
                      onClick={() => { const href = orderHref(order); if (href) router.push(href); }}
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
                        {orderSiteName(order)} &bull; {orderPlotLabel(order)}{" "}
                        &bull; {orderJobLabel(order)}
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
              {data.counts.sendOrder} order{data.counts.sendOrder !== 1 ? "s" : ""} in {supplierGroups.length} batch{supplierGroups.length !== 1 ? "es" : ""} (one per supplier + placement date — just-in-time)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {supplierGroups.map((group) => {
                const isGroupSending = sendingGroupIds.has(group.key);
                const plotNames = [...new Set(group.orders.map((o) => orderPlotLabel(o)))];
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

                // Urgency pill for the order-placement date (when this
                // email needs to go out).
                const orderDateObj = new Date(group.orderDateISO);
                const todayMidnight = getCurrentDateAtMidnight();
                const daysUntilOrder = Math.ceil(
                  (orderDateObj.getTime() - todayMidnight.getTime()) / 86400000
                );
                const orderUrgency: "overdue" | "today" | "upcoming" =
                  daysUntilOrder < 0 ? "overdue" : daysUntilOrder === 0 ? "today" : "upcoming";
                const urgencyLabel =
                  orderUrgency === "overdue"
                    ? `${Math.abs(daysUntilOrder)} day${Math.abs(daysUntilOrder) === 1 ? "" : "s"} overdue`
                    : orderUrgency === "today"
                      ? "Send today"
                      : `Send in ${daysUntilOrder} day${daysUntilOrder === 1 ? "" : "s"}`;

                return (
                  <div
                    key={group.key}
                    className="rounded-lg border border-blue-200/50 bg-blue-50/50 p-3"
                  >
                    {/* Supplier + date header with actions */}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{group.supplierName}</p>
                          <span className="text-sm font-semibold text-slate-700">
                            {format(orderDateObj, "d MMM")}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgencyBadge[orderUrgency]}`}>
                            {urgencyLabel}
                          </span>
                        </div>
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
                        title={
                          group.sites.length > 1
                            ? `Spans ${group.sites.length} sites — opens one email per site`
                            : "Send order to supplier via email"
                        }
                      >
                        <Mail className="size-3.5" />
                        {/* (Jun 2026 R25) Flag the multi-site split so the
                            user expects more than one email to open. */}
                        <span>
                          {group.sites.length > 1
                            ? `Send Orders (${group.sites.length} sites)`
                            : "Send Order"}
                        </span>
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
                        <span>Mark Sent</span>
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
                            onClick={() => { const href = orderHref(order); if (href) router.push(href); }}
                          >
                            <span className="min-w-0 flex-1 text-muted-foreground">
                              {orderPlotLabel(order)} &bull; {orderJobLabel(order)}
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
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-purple-50/50 border-purple-200/50 p-3"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => { const href = orderHref(order); if (href) router.push(href); }}
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
                        {orderSiteName(order)} &bull; {orderPlotLabel(order)}{" "}
                        &bull; {orderJobLabel(order)}
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
                      <span>Confirm</span>
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
                  onClick={() => { const href = orderHref(order); if (href) router.push(href); }}
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
                      {orderSiteName(order)} &bull; {orderPlotLabel(order)} &bull;{" "}
                      {orderJobLabel(order)}
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

      {pullForwardDialogs}
      {/* Unified delay dialog (useDelayJob) — same UX as Daily Brief, Walkthrough,
          and JobWeekPanel. Both input modes + reason picker live in one place. */}
      {delayDialogs}
      {/* Unified job-action dialogs (stop-reason, etc.) from useJobAction */}
      {jobActionDialogs}
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
