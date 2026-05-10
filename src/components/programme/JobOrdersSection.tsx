"use client";

import { format } from "date-fns";
import {
  Truck,
  ShoppingCart,
  Send,
  CircleCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * (May 2026 JobWeekPanel split) Orders + deliveries strip extracted
 * from JobWeekPanel. Renders the per-order card with status pill,
 * items summary, delivery date, and the contextual action button
 * (Mark Sent / Confirm Delivery).
 */

export interface JobOrder {
  id: string;
  status: string;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  leadTimeDays?: number | null;
  supplier: { name: string };
  orderItems?: Array<{ name?: string | null; quantity: number }>;
}

interface Props {
  orders: JobOrder[];
  isOrderPending: (id: string) => boolean;
  onAction: (orderId: string, status: "ORDERED" | "DELIVERED") => void;
  onOpenDetail: (orderId: string) => void;
}

export function JobOrdersSection({
  orders,
  isOrderPending,
  onAction,
  onOpenDetail,
}: Props) {
  if (orders.length === 0) return null;
  const statusColors: Record<string, string> = {
    PENDING: "bg-slate-100 text-slate-600",
    ORDERED: "bg-blue-100 text-blue-700",
    DELIVERED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-700",
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-muted-foreground" aria-hidden />
        <h4 className="text-sm font-semibold">Orders &amp; Deliveries</h4>
        <span className="text-xs text-muted-foreground">({orders.length})</span>
      </div>
      <div className="space-y-2">
        {orders.map((order) => {
          const isActioning = isOrderPending(order.id);
          return (
            <div key={order.id} className="rounded-lg border p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenDetail(order.id)}
                  className="font-medium truncate text-blue-600 hover:underline text-left"
                >
                  {order.supplier.name}
                </button>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    statusColors[order.status] || statusColors.PENDING
                  }`}
                >
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>
              {order.orderItems && order.orderItems.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {order.orderItems
                    .map((i) => `${i.quantity}x ${i.name || "item"}`)
                    .join(", ")}
                </p>
              )}
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="size-2.5" aria-hidden />
                    {format(new Date(order.dateOfOrder), "d MMM")}
                  </span>
                  {order.expectedDeliveryDate && (
                    <span className="flex items-center gap-1">
                      <Truck className="size-2.5" aria-hidden />
                      {format(new Date(order.expectedDeliveryDate), "d MMM")}
                    </span>
                  )}
                  {order.leadTimeDays != null && (
                    <span className="text-muted-foreground/70">
                      {order.leadTimeDays}d
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {order.status === "PENDING" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={isActioning}
                      onClick={() => onAction(order.id, "ORDERED")}
                    >
                      {isActioning ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <Send className="size-3" aria-hidden />
                      )}
                      Mark Sent
                    </Button>
                  )}
                  {order.status === "ORDERED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px] border-green-300 text-green-700 hover:bg-green-50"
                      disabled={isActioning}
                      onClick={() => onAction(order.id, "DELIVERED")}
                    >
                      {isActioning ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <CircleCheck className="size-3" aria-hidden />
                      )}
                      Confirm Delivery
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
