"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Briefcase,
  Play,
  Pause,
  CheckCircle,
  MapPin,
  Calendar,
  User,
  GitBranch,
  Building,
  Hash,
  ShoppingCart,
  Clock,
  CircleDot,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// ---------- Types ----------

interface JobDetail {
  id: string;
  name: string;
  description: string | null;
  workflowId: string;
  location: string | null;
  address: string | null;
  siteName: string | null;
  plot: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  workflow: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdById: string;
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  orders: Array<{
    id: string;
    supplierId: string;
    jobId: string;
    orderDetails: string | null;
    dateOfOrder: string;
    orderType: string | null;
    automated: boolean;
    status: string;
    expectedDeliveryDate: string | null;
    deliveredDate: string | null;
    leadTimeDays: number | null;
    items: string | null;
    createdAt: string;
    updatedAt: string;
    supplier: { id: string; name: string };
  }>;
  actions: Array<{
    id: string;
    jobId: string;
    userId: string;
    action: string;
    notes: string | null;
    createdAt: string;
    user: { id: string; name: string };
  }>;
}

// ---------- Status Config ----------

const STATUS_CONFIG: Record<
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

const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: "Pending", variant: "outline" },
  ORDERED: { label: "Ordered", variant: "secondary" },
  CONFIRMED: { label: "Confirmed", variant: "default" },
  DELIVERED: { label: "Delivered", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const ACTION_ICON_MAP: Record<string, { icon: typeof Play; color: string }> = {
  start: { icon: Play, color: "text-amber-500" },
  stop: { icon: Pause, color: "text-red-500" },
  complete: { icon: CheckCircle, color: "text-green-500" },
  edit: { icon: Briefcase, color: "text-blue-500" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_STARTED;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${config.bgColor}`}
    >
      <CircleDot className={`size-3 ${config.dotColor}`} />
      <span>{config.label}</span>
    </div>
  );
}

// ---------- Main Component ----------

export function JobDetailClient({ job: initialJob }: { job: JobDetail }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/jobs/${job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJob((prev) => ({ ...prev, status: updated.status }));
        router.refresh();
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => router.push("/jobs")}
        >
          <ArrowLeft className="size-4" data-icon="inline-start" />
          Back to Jobs
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{job.name}</h1>
              {job.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {job.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            {job.status !== "IN_PROGRESS" && job.status !== "COMPLETED" && (
              <Button
                size="sm"
                onClick={() => handleAction("start")}
                disabled={actionLoading !== null}
              >
                <Play className="size-3.5" data-icon="inline-start" />
                {actionLoading === "start" ? "Starting..." : "Start"}
              </Button>
            )}
            {job.status === "IN_PROGRESS" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleAction("stop")}
                disabled={actionLoading !== null}
              >
                <Pause className="size-3.5" data-icon="inline-start" />
                {actionLoading === "stop" ? "Stopping..." : "Stop"}
              </Button>
            )}
            {job.status !== "COMPLETED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("complete")}
                disabled={actionLoading !== null}
              >
                <CheckCircle className="size-3.5" data-icon="inline-start" />
                {actionLoading === "complete" ? "Completing..." : "Complete"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={GitBranch}
          label="Workflow"
          value={job.workflow.name}
        />
        <InfoCard
          icon={User}
          label="Assigned To"
          value={job.assignedTo?.name ?? "Unassigned"}
        />
        <InfoCard
          icon={Building}
          label="Site"
          value={job.siteName ?? "\u2014"}
        />
        <InfoCard
          icon={Hash}
          label="Plot"
          value={job.plot ?? "\u2014"}
        />
        <InfoCard
          icon={MapPin}
          label="Location"
          value={job.location ?? "\u2014"}
        />
        <InfoCard
          icon={MapPin}
          label="Address"
          value={job.address ?? "\u2014"}
        />
        <InfoCard
          icon={Calendar}
          label="Start Date"
          value={
            job.startDate
              ? format(new Date(job.startDate), "dd MMM yyyy")
              : "\u2014"
          }
        />
        <InfoCard
          icon={Calendar}
          label="End Date"
          value={
            job.endDate
              ? format(new Date(job.endDate), "dd MMM yyyy")
              : "\u2014"
          }
        />
      </div>

      {/* Orders + Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <CardTitle>Material Orders</CardTitle>
            </div>
            <CardDescription>
              {job.orders.length} order{job.orders.length !== 1 ? "s" : ""}{" "}
              for this job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.orders.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Package className="size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No orders placed yet
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {job.orders.map((order) => {
                  const orderConfig =
                    ORDER_STATUS_CONFIG[order.status] ??
                    ORDER_STATUS_CONFIG.PENDING;
                  return (
                    <div
                      key={order.id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {order.supplier.name}
                        </p>
                        {order.orderDetails && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {order.orderDetails}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ordered{" "}
                          {format(
                            new Date(order.dateOfOrder),
                            "dd MMM yyyy"
                          )}
                          {order.expectedDeliveryDate &&
                            ` \u2022 Expected ${format(
                              new Date(order.expectedDeliveryDate),
                              "dd MMM yyyy"
                            )}`}
                        </p>
                      </div>
                      <Badge variant={orderConfig.variant}>
                        {orderConfig.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions / History */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <CardTitle>Action History</CardTitle>
            </div>
            <CardDescription>
              Timeline of actions taken on this job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.actions.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Clock className="size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No actions recorded yet
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {job.actions.map((action, index) => {
                  const actionConfig =
                    ACTION_ICON_MAP[action.action] ?? {
                      icon: Briefcase,
                      color: "text-muted-foreground",
                    };
                  const ActionIcon = actionConfig.icon;
                  const actionLabel =
                    action.action.charAt(0).toUpperCase() +
                    action.action.slice(1);

                  return (
                    <div
                      key={action.id}
                      className={`flex items-start gap-3 py-3 ${
                        index !== job.actions.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <div className="mt-0.5">
                        <ActionIcon
                          className={`size-4 ${actionConfig.color}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {actionLabel}
                          {action.action === "start" && "ed"}
                          {action.action === "stop" && "ped"}
                          {action.action === "complete" && "d"}
                          {action.action === "edit" && "ed"}
                        </p>
                        {action.notes && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {action.notes}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>by {action.user.name}</span>
                          <span className="text-border">&middot;</span>
                          <span>
                            {formatDistanceToNow(
                              new Date(action.createdAt),
                              { addSuffix: true }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {job.description && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {job.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------- Info Card ----------

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
