"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, isPast, isToday, differenceInDays } from "date-fns";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ---------- Types ----------

interface OrderTask {
  id: string;
  status: string;
  expectedDeliveryDate: string | null;
  dateOfOrder: string;
  itemsDescription: string | null;
  supplier: { id: string; name: string; contactEmail?: string | null; contactName?: string | null };
  job: {
    id: string;
    name: string;
    plot: {
      id: string;
      name: string;
      site: { id: string; name: string };
    };
  };
  orderItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
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
  overdueOrders: OrderTask[];
  upcomingJobs: JobTask[];
  upcomingDeliveries: OrderTask[];
  counts: {
    confirmDelivery: number;
    sendOrder: number;
    signOffJobs: number;
    overdueJobs: number;
    overdueOrders: number;
    upcoming: number;
  };
}

// ---------- Urgency ----------

function getUrgency(dateStr: string | null): "overdue" | "today" | "upcoming" {
  if (!dateStr) return "upcoming";
  const d = new Date(dateStr);
  if (isPast(d) && !isToday(d)) return "overdue";
  if (isToday(d)) return "today";
  return "upcoming";
}

function daysOverdue(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, differenceInDays(new Date(), new Date(dateStr)));
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
  const [data, setData] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [chaseDialogOpen, setChaseDialogOpen] = useState(false);
  const [chaseOrder, setChaseOrder] = useState<OrderTask | null>(null);
  const [chaseSubject, setChaseSubject] = useState("");
  const [chaseBody, setChaseBody] = useState("");

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Quick confirm delivery ──
  async function handleQuickConfirm(orderId: string, listKey: "confirmDelivery" | "overdueOrders") {
    setConfirmingIds((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DELIVERED" }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          [listKey]: (data[listKey] as OrderTask[]).filter((o) => o.id !== orderId),
          counts: {
            ...data.counts,
            [listKey]: (data.counts[listKey as keyof typeof data.counts] as number) - 1,
          },
        });
      }
    } catch (err) {
      console.error("Failed to confirm delivery:", err);
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
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
      if (res.ok && data) {
        setData({
          ...data,
          overdueJobs: data.overdueJobs.filter((j) => j.id !== jobId),
          counts: { ...data.counts, overdueJobs: data.counts.overdueJobs - 1 },
        });
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

  // ── Chase supplier email ──
  function openChaseDialog(order: OrderTask) {
    const days = daysOverdue(order.expectedDeliveryDate);
    const siteName = order.job.plot.site.name;
    const contactName = order.supplier.contactName || order.supplier.name;
    const itemsList = order.orderItems.length > 0
      ? order.orderItems.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")
      : order.itemsDescription || "materials";
    const expectedDate = order.expectedDeliveryDate
      ? format(new Date(order.expectedDeliveryDate), "dd MMM yyyy")
      : "N/A";

    setChaseOrder(order);
    setChaseSubject(`Overdue Delivery — Order for ${order.job.name} at ${siteName}`);
    setChaseBody(
      `Hi ${contactName},\n\n` +
      `We are chasing delivery of the following order for ${order.job.name} at ${siteName}, ${order.job.plot.name}:\n\n` +
      `Items: ${itemsList}\n\n` +
      `The expected delivery date was ${expectedDate} and the order is now ${days} day${days !== 1 ? "s" : ""} overdue.\n\n` +
      `Please confirm the updated delivery date at your earliest convenience.\n\n` +
      `Regards`
    );
    setChaseDialogOpen(true);
  }

  function handleSendChase() {
    if (!chaseOrder) return;
    const email = chaseOrder.supplier.contactEmail || "";
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(chaseSubject)}&body=${encodeURIComponent(chaseBody)}`;
    window.open(mailto, "_blank");

    // Log event (fire and forget)
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "USER_ACTION",
        description: `Chased ${chaseOrder.supplier.name} for overdue delivery — ${chaseOrder.job.name}`,
        siteId: chaseOrder.job.plot.site.id,
        jobId: chaseOrder.job.id,
      }),
    }).catch(() => {});

    setChaseDialogOpen(false);
  }

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
    data.counts.overdueOrders;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalActions > 0
            ? `${totalActions} action${totalActions !== 1 ? "s" : ""} require your attention`
            : "All caught up! No pending actions."}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                const isConfirming = confirmingIds.has(order.id);
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
                        {order.supplier.name}
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
                      Confirm
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
                      Chase
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
                      Stop
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
                      Sign Off
                    </Button>
                  </div>
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
                const isConfirming = confirmingIds.has(order.id);
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
                        {order.supplier.name}
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

      {/* ── Send Order Section ── */}
      {data.sendOrder.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="size-4 text-blue-600" />
              <CardTitle>Send Orders</CardTitle>
            </div>
            <CardDescription>
              Pending orders that need to be placed with suppliers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.sendOrder.map((order) => (
                <button
                  key={order.id}
                  className="flex w-full items-center justify-between rounded-lg border bg-blue-50/50 border-blue-200/50 p-3 text-left transition-colors hover:bg-accent/50"
                  onClick={() => router.push(`/jobs/${order.job.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {order.supplier.name}
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
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Pending</Badge>
                    <ArrowRight className="size-4 text-muted-foreground/40" />
                  </div>
                </button>
              ))}
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
                      <p className="text-sm font-medium">{order.supplier.name}</p>
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

      {/* ── Chase Supplier Email Dialog ── */}
      <Dialog open={chaseDialogOpen} onOpenChange={setChaseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chase Supplier</DialogTitle>
            <DialogDescription>
              Send a chaser email to {chaseOrder?.supplier.name} for overdue delivery
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                value={chaseOrder?.supplier.contactEmail || "No email on file"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={chaseSubject}
                onChange={(e) => setChaseSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={chaseBody}
                onChange={(e) => setChaseBody(e.target.value)}
                rows={8}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSendChase}
              disabled={!chaseOrder?.supplier.contactEmail}
            >
              <Mail className="size-4" />
              Open in Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
