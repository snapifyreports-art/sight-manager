"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
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
  parentId?: string | null;
  parentStage?: string | null;
  sortOrder?: number;
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

/** A parent stage group header (synthetic row) */
interface ParentGroup {
  type: "parent";
  parentStage: string;
  parentJobId: string | null;
  children: GanttJob[];
  earliestStart: Date | null;
  latestEnd: Date | null;
  aggregateStatus: string;
}

/** A regular job row (either a child or a standalone) */
interface JobRow {
  type: "job";
  job: GanttJob;
  indented: boolean;
}

type DisplayRow = ParentGroup | JobRow;

interface GanttChartProps {
  jobs: GanttJob[];
}

/** Compute aggregate status from child jobs */
function computeAggregateStatus(children: GanttJob[]): string {
  if (children.length === 0) return "NOT_STARTED";
  const allCompleted = children.every((c) => c.status === "COMPLETED");
  if (allCompleted) return "COMPLETED";
  const anyInProgress = children.some(
    (c) => c.status === "IN_PROGRESS" || c.status === "COMPLETED"
  );
  if (anyInProgress) return "IN_PROGRESS";
  const anyOnHold = children.some((c) => c.status === "ON_HOLD");
  if (anyOnHold) return "ON_HOLD";
  return "NOT_STARTED";
}

/** Compute progress percentage (completed children / total) */
function computeProgress(children: GanttJob[]): number {
  if (children.length === 0) return 0;
  const completed = children.filter((c) => c.status === "COMPLETED").length;
  return Math.round((completed / children.length) * 100);
}

/** Parent row height — same as regular row */
const PARENT_ROW_HEIGHT = ROW_HEIGHT;

export function GanttChart({ jobs }: GanttChartProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track which parent stages are expanded
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set()
  );

  const toggleParent = useCallback((parentStage: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentStage)) {
        next.delete(parentStage);
      } else {
        next.add(parentStage);
      }
      return next;
    });
  }, []);

  // Build grouped structure: parent stages with children, plus standalone jobs
  const allRows = useMemo(() => {
    const rows: DisplayRow[] = [];
    const grouped = new Map<string, GanttJob[]>();
    const standalone: GanttJob[] = [];

    // Separate jobs into groups and standalone
    for (const job of jobs) {
      if (job.parentStage) {
        const arr = grouped.get(job.parentStage) || [];
        arr.push(job);
        grouped.set(job.parentStage, arr);
      } else {
        standalone.push(job);
      }
    }

    // If there are no grouped jobs, return flat list
    if (grouped.size === 0) {
      return jobs.map(
        (job): JobRow => ({ type: "job", job, indented: false })
      );
    }

    // Build ordered rows: we use sortOrder of the first child in each group
    // to determine where the parent row goes relative to standalone jobs
    const parentEntries: Array<{
      parentStage: string;
      parentJobId: string | null;
      children: GanttJob[];
      minSortOrder: number;
    }> = [];

    for (const [parentStage, children] of grouped) {
      const sorted = children.sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      const minSortOrder = Math.min(
        ...sorted.map((c) => c.sortOrder ?? 0)
      );
      // Find the actual parent job ID from the first child's parentId,
      // or fall back to a standalone job with matching name
      const parentJobId =
        sorted[0]?.parentId ||
        standalone.find((j) => j.name === parentStage)?.id ||
        null;
      parentEntries.push({ parentStage, children: sorted, minSortOrder, parentJobId });
    }

    // Combine standalone jobs and parent entries, sort by sortOrder
    const allEntries: Array<
      | { kind: "standalone"; job: GanttJob; sortOrder: number }
      | {
          kind: "group";
          parentStage: string;
          parentJobId: string | null;
          children: GanttJob[];
          sortOrder: number;
        }
    > = [];

    for (const job of standalone) {
      // Skip standalone jobs that are actually parents of grouped children
      // (they're represented by the group header row instead)
      if (grouped.has(job.name)) continue;
      allEntries.push({
        kind: "standalone",
        job,
        sortOrder: job.sortOrder ?? 0,
      });
    }

    for (const entry of parentEntries) {
      allEntries.push({
        kind: "group",
        parentStage: entry.parentStage,
        parentJobId: entry.parentJobId,
        children: entry.children,
        sortOrder: entry.minSortOrder,
      });
    }

    allEntries.sort((a, b) => a.sortOrder - b.sortOrder);

    // Build final row list
    for (const entry of allEntries) {
      if (entry.kind === "standalone") {
        rows.push({ type: "job", job: entry.job, indented: false });
      } else {
        // Compute aggregate date range
        let earliestStart: Date | null = null;
        let latestEnd: Date | null = null;

        for (const child of entry.children) {
          if (child.startDate) {
            const d = new Date(child.startDate);
            if (!earliestStart || d < earliestStart) earliestStart = d;
          }
          if (child.endDate) {
            const d = new Date(child.endDate);
            if (!latestEnd || d > latestEnd) latestEnd = d;
          }
        }

        rows.push({
          type: "parent",
          parentStage: entry.parentStage,
          parentJobId: entry.parentJobId,
          children: entry.children,
          earliestStart,
          latestEnd,
          aggregateStatus: computeAggregateStatus(entry.children),
        });

        // Children are added as separate rows (shown/hidden by expand state)
        for (const child of entry.children) {
          rows.push({ type: "job", job: child, indented: true });
        }
      }
    }

    return rows;
  }, [jobs]);

  // Filter visible rows based on expand state
  const visibleRows = useMemo(() => {
    const result: DisplayRow[] = [];
    let skipChildren = false;
    let currentParent: string | null = null;

    for (const row of allRows) {
      if (row.type === "parent") {
        result.push(row);
        currentParent = row.parentStage;
        skipChildren = !expandedParents.has(row.parentStage);
      } else if (row.indented && currentParent) {
        if (!skipChildren) {
          result.push(row);
        }
      } else {
        // Standalone job
        skipChildren = false;
        currentParent = null;
        result.push(row);
      }
    }

    return result;
  }, [allRows, expandedParents]);

  // Collect all jobs for timeline range calculation
  const allJobs = useMemo(() => {
    const result: GanttJob[] = [];
    for (const row of allRows) {
      if (row.type === "job") {
        result.push(row.job);
      } else {
        result.push(...row.children);
      }
    }
    return result;
  }, [allRows]);

  // Calculate timeline range from all jobs
  const { timelineStart, timelineEnd } = useMemo(
    () => getTimelineRange(allJobs),
    [allJobs]
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
  const totalHeight = visibleRows.length * ROW_HEIGHT;

  // Auto-scroll to center today's date
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const today = getCurrentDate();
    const todayOffset = getPositionForDate(today, timelineStart, DAY_WIDTH);
    const containerWidth = container.clientWidth;

    const scrollTarget = todayOffset - containerWidth / 2;
    container.scrollLeft = Math.max(0, scrollTarget);
  }, [timelineStart]);

  if (allJobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No jobs to display on the timeline.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex">
        {/* Left Panel (sticky job names) */}
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

          {/* Row labels */}
          {visibleRows.map((row, index) => {
            if (row.type === "parent") {
              const colors = getStatusColor(row.aggregateStatus);
              const isExpanded = expandedParents.has(row.parentStage);
              const progress = computeProgress(row.children);

              return (
                <div
                  key={`parent-${row.parentStage}`}
                  className={cn(
                    "flex items-center gap-2 px-3 border-b border-gray-200 cursor-pointer select-none",
                    "bg-slate-100 hover:bg-slate-200/80 transition-colors"
                  )}
                  style={{ height: `${PARENT_ROW_HEIGHT}px` }}
                  onClick={() => toggleParent(row.parentStage)}
                >
                  {/* Expand/collapse chevron */}
                  <svg
                    className={cn(
                      "w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform duration-150",
                      isExpanded && "rotate-90"
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>

                  {/* Status dot */}
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      colors.dot
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <a
                      href={`/jobs/${row.parentJobId || row.children[0]?.id}`}
                      className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline truncate block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.parentStage}
                    </a>
                    <p className="text-[11px] text-gray-500">
                      {row.children.length} sub-jobs &middot; {progress}%
                    </p>
                  </div>
                </div>
              );
            }

            // Job row
            const { job, indented } = row;
            const colors = getStatusColor(job.status);
            return (
              <div
                key={job.id}
                className={cn(
                  "flex items-center gap-2.5 border-b border-gray-100",
                  indented ? "pl-8 pr-3" : "px-3",
                  index % 2 === 1 ? "bg-blue-50/30" : "bg-white"
                )}
                style={{ height: `${ROW_HEIGHT}px` }}
              >
                {/* Status dot */}
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full shrink-0",
                    colors.dot
                  )}
                />
                <a
                  href={`/jobs/${job.id}`}
                  className="min-w-0 flex-1 cursor-pointer hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-medium text-blue-700 hover:text-blue-900 truncate">
                    {job.name}
                  </p>
                  {job.assignedTo && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {job.assignedTo.name}
                    </p>
                  )}
                </a>
              </div>
            );
          })}
        </div>

        {/* Right Panel (scrollable timeline) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
        >
          <div
            className="relative"
            style={{ width: `${timelineWidth}px` }}
          >
            {/* Week header row */}
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

            {/* Chart body */}
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

              {/* Row backgrounds */}
              {visibleRows.map((row, index) => {
                const isParent = row.type === "parent";
                return (
                  <div
                    key={`row-bg-${isParent ? `parent-${row.parentStage}` : row.job.id}`}
                    className={cn(
                      "absolute w-full border-b",
                      isParent
                        ? "bg-slate-100 border-gray-200"
                        : cn(
                            "border-gray-100",
                            index % 2 === 1
                              ? "bg-blue-50/30"
                              : "bg-transparent"
                          )
                    )}
                    style={{
                      top: `${index * ROW_HEIGHT}px`,
                      height: `${ROW_HEIGHT}px`,
                    }}
                  />
                );
              })}

              {/* Bars — parent aggregate bars and job bars */}
              {visibleRows.map((row, index) => {
                if (row.type === "parent") {
                  // Aggregate all orders from children for parent row flags
                  const parentOrders = row.children.flatMap((c) => c.orders);
                  return (
                    <div
                      key={`bar-parent-${row.parentStage}`}
                      className="absolute"
                      style={{
                        top: `${index * ROW_HEIGHT}px`,
                        height: `${ROW_HEIGHT}px`,
                        width: `${timelineWidth}px`,
                      }}
                    >
                      <ParentAggregateBar
                        group={row}
                        timelineStart={timelineStart}
                        rowIndex={index}
                        timelineWidth={timelineWidth}
                      />
                      {/* Order/delivery flags on parent row */}
                      {parentOrders.map((order) => (
                        <div key={order.id}>
                          <GanttOrderFlag
                            order={order}
                            timelineStart={timelineStart}
                            type="order"
                            rowIndex={0}
                          />
                          {order.expectedDeliveryDate && (
                            <GanttOrderFlag
                              order={order}
                              timelineStart={timelineStart}
                              type="delivery"
                              rowIndex={0}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }

                // Regular job bar
                const { job } = row;
                return (
                  <div
                    key={`bar-${job.id}`}
                    className="absolute"
                    style={{
                      top: `${index * ROW_HEIGHT}px`,
                      height: `${ROW_HEIGHT}px`,
                      width: `${timelineWidth}px`,
                    }}
                  >
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
                );
              })}

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

/** Renders an aggregate bar for a parent stage group */
function ParentAggregateBar({
  group,
  timelineStart,
  rowIndex,
  timelineWidth,
}: {
  group: ParentGroup;
  timelineStart: Date;
  rowIndex: number;
  timelineWidth: number;
}) {
  if (!group.earliestStart || !group.latestEnd) return null;

  const left = getPositionForDate(group.earliestStart, timelineStart, DAY_WIDTH);
  const endPos = getPositionForDate(group.latestEnd, timelineStart, DAY_WIDTH);
  const width = Math.max(endPos - left, DAY_WIDTH);

  const progress = computeProgress(group.children);
  const colors = getStatusColor(group.aggregateStatus);

  const barHeight = 20;
  const barTop = (ROW_HEIGHT - barHeight) / 2 + 2;

  return (
    <div
      className="absolute inset-0"
    >
      {/* Background track */}
      <div
        className="absolute rounded-md bg-gray-300/50"
        style={{
          left: `${left}px`,
          top: `${barTop}px`,
          width: `${width}px`,
          height: `${barHeight}px`,
        }}
      >
        {/* Progress fill */}
        <div
          className={cn("h-full rounded-md transition-all", colors.bg)}
          style={{ width: `${progress}%` }}
        />

        {/* Progress text */}
        {width > 50 && (
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[10px] font-bold",
              progress > 40 ? "text-white" : "text-gray-600"
            )}
          >
            {progress}%
          </span>
        )}
      </div>

      {/* Bracket caps at start and end */}
      <div
        className="absolute w-1.5 bg-gray-400 rounded-sm"
        style={{
          left: `${left}px`,
          top: `${barTop - 3}px`,
          height: `${barHeight + 6}px`,
        }}
      />
      <div
        className="absolute w-1.5 bg-gray-400 rounded-sm"
        style={{
          left: `${left + width - 6}px`,
          top: `${barTop - 3}px`,
          height: `${barHeight + 6}px`,
        }}
      />
    </div>
  );
}
