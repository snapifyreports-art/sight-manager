"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getPositionForDate, DAY_WIDTH, ROW_HEIGHT } from "./GanttHelpers";

interface Order {
  id: string;
  orderDetails: string | null;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  status: string;
  supplier: { name: string };
}

interface GanttOrderFlagProps {
  order: Order;
  timelineStart: Date;
  type: "order" | "delivery";
  rowIndex: number;
}

export function GanttOrderFlag({
  order,
  timelineStart,
  type,
  rowIndex,
}: GanttOrderFlagProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const date =
    type === "order"
      ? new Date(order.dateOfOrder)
      : order.expectedDeliveryDate
      ? new Date(order.expectedDeliveryDate)
      : null;

  if (!date) return null;

  const left = getPositionForDate(date, timelineStart, DAY_WIDTH);

  // Position flags above the bar area
  const barHeight = 28;
  const barTop = (ROW_HEIGHT - barHeight) / 2 + 4;
  const flagTop = barTop - 18;

  const isOrderType = type === "order";

  const statusLabel = order.status.replace(/_/g, " ");
  const tooltipAbove = rowIndex >= 2;

  return (
    <div
      className="absolute z-20"
      style={{
        left: `${left - 8}px`,
        top: `${flagTop}px`,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Flag icon */}
      {isOrderType ? (
        // Purple diamond for order placed
        <div className="relative w-4 h-4 flex items-center justify-center cursor-pointer">
          <div className="absolute w-3 h-3 bg-purple-500 rotate-45 rounded-sm" />
          <span className="relative text-[8px] font-bold text-white leading-none">
            O
          </span>
        </div>
      ) : (
        // Teal triangle for expected delivery
        <div className="relative w-4 h-4 flex items-center justify-center cursor-pointer">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            className="absolute"
          >
            <polygon points="7,1 13,13 1,13" fill="#0d9488" />
          </svg>
          <span className="relative text-[8px] font-bold text-white leading-none mt-0.5">
            D
          </span>
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={cn(
            "absolute z-50 w-52 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg",
            "text-xs text-gray-700",
            tooltipAbove
              ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
              : "top-full mt-2 left-1/2 -translate-x-1/2"
          )}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {isOrderType ? (
              <div className="w-2 h-2 bg-purple-500 rotate-45 rounded-sm shrink-0" />
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                <polygon points="5,0 10,10 0,10" fill="#0d9488" />
              </svg>
            )}
            <span className="font-semibold text-gray-900">
              {isOrderType ? "Order Placed" : "Expected Delivery"}
            </span>
          </div>
          <div className="space-y-0.5 text-gray-500">
            <p>
              <span className="font-medium text-gray-600">Supplier:</span>{" "}
              {order.supplier.name}
            </p>
            {order.orderDetails && (
              <p className="truncate">
                <span className="font-medium text-gray-600">Details:</span>{" "}
                {order.orderDetails}
              </p>
            )}
            <p>
              <span className="font-medium text-gray-600">Status:</span>{" "}
              {statusLabel}
            </p>
            <p>
              <span className="font-medium text-gray-600">Date:</span>{" "}
              {format(date, "d MMM yyyy")}
            </p>
          </div>
          {/* Tooltip arrow */}
          <div
            className={cn(
              "absolute w-2 h-2 bg-white border-gray-200 rotate-45",
              tooltipAbove
                ? "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r"
                : "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l"
            )}
          />
        </div>
      )}
    </div>
  );
}
