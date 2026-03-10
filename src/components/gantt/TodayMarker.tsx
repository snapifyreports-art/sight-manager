"use client";

import { getPositionForDate, DAY_WIDTH, HEADER_HEIGHT } from "./GanttHelpers";

interface TodayMarkerProps {
  timelineStart: Date;
  totalHeight: number;
}

export function TodayMarker({ timelineStart, totalHeight }: TodayMarkerProps) {
  const today = new Date();
  const left = getPositionForDate(today, timelineStart, DAY_WIDTH);

  // Don't render if today is off the visible timeline
  if (left < 0) return null;

  return (
    <div
      className="absolute top-0 z-30 pointer-events-none"
      style={{
        left: `${left}px`,
        height: `${totalHeight + HEADER_HEIGHT}px`,
      }}
    >
      {/* "Today" label */}
      <div className="absolute -top-0.5 -translate-x-1/2 bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
        Today
      </div>

      {/* Dashed vertical line */}
      <div
        className="absolute top-5 w-px"
        style={{
          height: `${totalHeight + HEADER_HEIGHT - 20}px`,
          borderLeft: "1.5px dashed #ef4444",
        }}
      />
    </div>
  );
}
