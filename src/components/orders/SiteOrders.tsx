"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Package,
  Loader2,
  AlertTriangle,
  Truck,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface SiteOrder {
  id: string;
  status: string;
  orderDetails: string | null;
  itemsDescription: string | null;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  leadTimeDays: number | null;
  automated: boolean;
  supplier: { id: string; name: string };
  job: {
    id: string;
    name: string;
    plot: { id: string; name: string; plotNumber: string | null };
  };
  orderItems: OrderItem[];
}

interface SiteOrdersProps {
  siteId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: "Pending",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  ORDERED: {
    label: "Ordered",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "ORDERED", label: "Ordered" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DELIVERED", label: "Delivered" },
];

export function SiteOrders({ siteId }: SiteOrdersProps) {
  const [orders, setOrders] = useState<SiteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch(`/api/sites/${siteId}/orders`)
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const overdueOrders = orders.filter(
    (o) =>
      o.expectedDeliveryDate &&
      new Date(o.expectedDeliveryDate) < today &&
      o.status !== "DELIVERED" &&
      o.status !== "CANCELLED"
  );

  const statusCounts = {
    PENDING: orders.filter((o) => o.status === "PENDING").length,
    ORDERED: orders.filter((o) => o.status === "ORDERED").length,
    CONFIRMED: orders.filter((o) => o.status === "CONFIRMED").length,
    DELIVERED: orders.filter((o) => o.status === "DELIVERED").length,
  };

  const totalValue = orders.reduce((sum, o) => {
    return (
      sum +
      o.orderItems.reduce((s, item) => s + item.quantity * item.unitCost, 0)
    );
  }, 0);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <ShoppingCart className="size-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-lg font-semibold">{orders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-yellow-500/10 p-2">
              <Package className="size-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-semibold">{statusCounts.PENDING}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Truck className="size-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-lg font-semibold">{statusCounts.DELIVERED}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <AlertTriangle className="size-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-semibold">{overdueOrders.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {totalValue > 0 && (
        <p className="text-sm text-muted-foreground">
          Total order value:{" "}
          <span className="font-medium text-foreground">
            £{totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </span>
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? orders.length
              : statusCounts[tab.value as keyof typeof statusCounts] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                filter === tab.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="mb-2 size-8 opacity-30" />
          <p className="text-sm">
            {orders.length === 0
              ? "No material orders yet"
              : "No orders match this filter"}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((order) => {
            const isOverdue =
              order.expectedDeliveryDate &&
              new Date(order.expectedDeliveryDate) < today &&
              order.status !== "DELIVERED" &&
              order.status !== "CANCELLED";
            const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING;
            const itemTotal = order.orderItems.reduce(
              (s, i) => s + i.quantity * i.unitCost,
              0
            );

            return (
              <Card
                key={order.id}
                className={`text-left ${isOverdue ? "border-red-200" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">
                      <Link href={`/suppliers/${order.supplier.id}`} className="hover:underline hover:text-blue-600">
                        {order.supplier.name}
                      </Link>
                    </CardTitle>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${config.className}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/sites/${siteId}/plots/${order.job.plot.id}`} className="hover:underline hover:text-blue-600">
                      {order.job.plot.plotNumber
                        ? `Plot ${order.job.plot.plotNumber}`
                        : order.job.plot.name}
                    </Link>
                    {" · "}
                    <Link href={`/jobs/${order.job.id}`} className="hover:underline hover:text-blue-600">
                      {order.job.name}
                    </Link>
                  </p>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  {order.itemsDescription && (
                    <p className="text-muted-foreground">
                      {order.itemsDescription}
                    </p>
                  )}
                  {order.orderItems.length > 0 && (
                    <p className="text-muted-foreground">
                      {order.orderItems.length}{" "}
                      {order.orderItems.length === 1 ? "item" : "items"}
                      {itemTotal > 0 && (
                        <span>
                          {" "}
                          &middot; £
                          {itemTotal.toLocaleString("en-GB", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                    <span>
                      Ordered {format(new Date(order.dateOfOrder), "d MMM yyyy")}
                    </span>
                    {order.leadTimeDays != null && (
                      <span>{order.leadTimeDays}d lead</span>
                    )}
                    {order.expectedDeliveryDate && (
                      <span className={isOverdue ? "font-medium text-red-600" : ""}>
                        {isOverdue && (
                          <AlertTriangle className="mr-0.5 inline size-2.5" />
                        )}
                        Due{" "}
                        {format(
                          new Date(order.expectedDeliveryDate),
                          "d MMM yyyy"
                        )}
                      </span>
                    )}
                  </div>
                  {order.automated && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[9px]"
                    >
                      Auto-ordered
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
