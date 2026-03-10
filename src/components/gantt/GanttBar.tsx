"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  getPositionForDate,
  getBarWidth,
  getStatusColor,
  DAY_WIDTH,
  ROW_HEIGHT,
} from "./GanttHelpers";

interface GanttBarProps {
  job: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    assignedTo?: { name: string } | null;
  };
  timelineStart: Date;
  rowIndex: number;
}

export function GanttBar({ job, timelineStart, rowIndex }: GanttBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<"above" | "below">(
    "above"
  );
  const barRef = useRef<HTMLDivElement>(null);

  if (!job.startDate || !job.endDate) return null;

  const start = new Date(job.startDate);
  const end = new Date(job.endDate);
  const left = getPositionForDate(start, timelineStart, DAY_WIDTH);
  const width = getBarWidth(start, end, DAY_WIDTH);
  const colors = getStatusColor(job.status);

  // Bar is positioned vertically centered in the row, with space for flags above
  const barHeight = 28;
  const barTop = (ROW_HEIGHT - barHeight) / 2 + 4; // shift down slightly to leave flag space

  // Determine if bar is wide enough to show text
  const showLabel = width > 60;

  const handleMouseEnter = () => {
    setShowTooltip(true);
    // Decide tooltip position based on row index
    if (rowIndex < 2) {
      setTooltipPosition("below");
    } else {
      setTooltipPosition("above");
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  const statusLabel = job.status.replace(/_/g, " ");

  return (
    <div
      ref={barRef}
      className={cn(
        "absolute rounded-md cursor-pointer transition-shadow duration-150",
        "hover:shadow-md hover:ring-1 hover:ring-white/50",
        colors.bg
      )}
      style={{
        left: `${left}px`,
        top: `${barTop}px`,
        width: `${width}px`,
        height: `${barHeight}px`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Bar label */}
      {showLabel && (
        <span
          className={cn(
            "absolute inset-0 flex items-center px-2 text-xs font-medium truncate",
            colors.text
          )}
        >
          {job.name}
        </span>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={cn(
            "absolute z-50 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg",
            "text-sm text-gray-700",
            tooltipPosition === "above"
              ? "bottom-full mb-2 left-0"
              : "top-full mt-2 left-0"
          )}
        >
          <p className="font-semibold text-gray-900 mb-1 truncate">
            {job.name}
          </p>
          <div className="space-y-0.5 text-xs text-gray-500">
            <p>
              <span className="font-medium text-gray-600">Status:</span>{" "}
              {statusLabel}
            </p>
            <p>
              <span className="font-medium text-gray-600">Start:</span>{" "}
              {format(start, "d MMM yyyy")}
            </p>
            <p>
              <span className="font-medium text-gray-600">End:</span>{" "}
              {format(end, "d MMM yyyy")}
            </p>
            {job.assignedTo && (
              <p>
                <span className="font-medium text-gray-600">Assigned:</span>{" "}
                {job.assignedTo.name}
              </p>
            )}
          </div>
          {/* Tooltip arrow */}
          <div
            className={cn(
              "absolute w-2 h-2 bg-white border-gray-200 rotate-45",
              tooltipPosition === "above"
                ? "bottom-[-5px] left-4 border-b border-r"
                : "top-[-5px] left-4 border-t border-l"
            )}
          />
        </div>
      )}
    </div>
  );
}
