"use client";

import { useRef, useEffect, useMemo } from "react";
import { differenceInDays, getMonth } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { cn } from "@/lib/utils";
import {
  getWeeksBetween,
  getPositionForDate,
  getTimelineRange,
  getStatusColor,
  formatWeekLabel,
  DAY_WIDTH,
  ROW_HEIGHT,
  LEFT_PANEL_WIDTH,
  HEADER_HEIGHT,
} from "./GanttHelpers";
import { GanttBar } from "./GanttBar";
import { GanttOrderFlag } from "./GanttOrderFlag";
import { TodayMarker } from "./TodayMarker";

interface GanttJob {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignedTo?: { name: string } | null;
  orders: Array<{
    id: string;
    orderDetails: string | null;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    status: string;
    supplier: { name: string };
  }>;
}

interface GanttChartProps {
  jobs: GanttJob[];
}

export function GanttChart({ jobs }: GanttChartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Separate jobs with dates (rendered as bars) from those without
  const { datedJobs, undatedJobs } = useMemo(() => {
    const dated: GanttJob[] = [];
    const undated: GanttJob[] = [];
    for (const job of jobs) {
      if (job.startDate && job.endDate) {
        dated.push(job);
      } else {
        undated.push(job);
      }
    }
    return { datedJobs: dated, undatedJobs: undated };
  }, [jobs]);

  // All jobs in display order: dated first, then undated at the end
  const displayJobs = useMemo(
    () => [...datedJobs, ...undatedJobs],
    [datedJobs, undatedJobs]
  );

  // Calculate timeline range from all jobs (including undated for order dates)
  const { timelineStart, timelineEnd } = useMemo(
    () => getTimelineRange(jobs),
    [jobs]
  );

  // Week columns
  const weeks = useMemo(
    () => getWeeksBetween(timelineStart, timelineEnd),
    [timelineStart, timelineEnd]
  );

  // Total timeline width in pixels
  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const timelineWidth = totalDays * DAY_WIDTH;

  // Total chart height
  const totalHeight = displayJobs.length * ROW_HEIGHT;

  // Auto-scroll to center today's date
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const today = getCurrentDate();
    const todayOffset = getPositionForDate(today, timelineStart, DAY_WIDTH);
    const containerWidth = container.clientWidth;

    // Center today in the visible area
    const scrollTarget = todayOffset - containerWidth / 2;
    container.scrollLeft = Math.max(0, scrollTarget);
  }, [timelineStart]);

  if (displayJobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No jobs to display on the timeline.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex">
        {/* ─── Left Panel (sticky job names) ─── */}
        <div
          className="shrink-0 border-r border-gray-200 bg-white z-20"
          style={{ width: `${LEFT_PANEL_WIDTH}px` }}
        >
          {/* Header spacer */}
          <div
            className="border-b border-gray-200 bg-slate-50 px-3 flex items-center"
            style={{ height: `${HEADER_HEIGHT}px` }}
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Jobs
            </span>
          </div>

          {/* Job rows */}
          {displayJobs.map((job, index) => {
            const colors = getStatusColor(job.status);
            return (
              <div
                key={job.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 border-b border-gray-100",
                  index % 2 === 1 ? "bg-blue-50/30" : "bg-white"
                )}
                style={{ height: `${ROW_HEIGHT}px` }}
              >
                {/* Status dot */}
                <div
                  className={cn("w-2.5 h-2.5 rounded-full shrink-0", colors.dot)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {job.name}
                  </p>
                  {job.assignedTo && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {job.assignedTo.name}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Right Panel (scrollable timeline) ─── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
        >
          <div
            className="relative"
            style={{ width: `${timelineWidth}px` }}
          >
            {/* ── Week header row ── */}
            <div
              className="sticky top-0 z-10 flex border-b border-gray-200 bg-slate-50"
              style={{ height: `${HEADER_HEIGHT}px` }}
            >
              {weeks.map((weekDate, i) => {
                const left = getPositionForDate(
                  weekDate,
                  timelineStart,
                  DAY_WIDTH
                );
                const weekWidth = 7 * DAY_WIDTH;

                // Detect month boundary: is this week in a different month than the previous?
                const isMonthBoundary =
                  i > 0 && getMonth(weekDate) !== getMonth(weeks[i - 1]);

                return (
                  <div
                    key={weekDate.toISOString()}
                    className={cn(
                      "absolute flex items-center justify-center text-[11px] font-medium text-gray-500",
                      "border-r",
                      isMonthBoundary
                        ? "border-r-gray-300"
                        : "border-r-gray-100"
                    )}
                    style={{
                      left: `${left}px`,
                      width: `${weekWidth}px`,
                      height: `${HEADER_HEIGHT}px`,
                    }}
                  >
                    {formatWeekLabel(weekDate)}
                  </div>
                );
              })}
            </div>

            {/* ── Chart body ── */}
            <div className="relative" style={{ height: `${totalHeight}px` }}>
              {/* Week gridlines */}
              {weeks.map((weekDate, i) => {
                const left = getPositionForDate(
                  weekDate,
                  timelineStart,
                  DAY_WIDTH
                );
                const isMonthBoundary =
                  i > 0 && getMonth(weekDate) !== getMonth(weeks[i - 1]);

                return (
                  <div
                    key={`grid-${weekDate.toISOString()}`}
                    className={cn(
                      "absolute top-0 w-px",
                      isMonthBoundary ? "bg-gray-300" : "bg-gray-100"
                    )}
                    style={{
                      left: `${left}px`,
                      height: `${totalHeight}px`,
                    }}
                  />
                );
              })}

              {/* Row backgrounds and horizontal gridlines */}
              {displayJobs.map((job, index) => (
                <div
                  key={`row-${job.id}`}
                  className={cn(
                    "absolute w-full border-b border-gray-100",
                    index % 2 === 1 ? "bg-blue-50/30" : "bg-transparent"
                  )}
                  style={{
                    top: `${index * ROW_HEIGHT}px`,
                    height: `${ROW_HEIGHT}px`,
                  }}
                />
              ))}

              {/* Job bars */}
              {displayJobs.map((job, index) => (
                <div
                  key={`bar-${job.id}`}
                  className="absolute"
                  style={{
                    top: `${index * ROW_HEIGHT}px`,
                    height: `${ROW_HEIGHT}px`,
                    width: `${timelineWidth}px`,
                  }}
                >
                  {/* The bar itself */}
                  <GanttBar
                    job={job}
                    timelineStart={timelineStart}
                    rowIndex={index}
                  />

                  {/* Order flags */}
                  {job.orders.map((order) => (
                    <div key={order.id}>
                      <GanttOrderFlag
                        order={order}
                        timelineStart={timelineStart}
                        type="order"
                        rowIndex={index}
                      />
                      {order.expectedDeliveryDate && (
                        <GanttOrderFlag
                          order={order}
                          timelineStart={timelineStart}
                          type="delivery"
                          rowIndex={index}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Today marker */}
              <TodayMarker
                timelineStart={timelineStart}
                totalHeight={totalHeight}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
