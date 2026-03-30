"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { ChevronRight, ChevronDown, Package } from "lucide-react";
import type { TemplateJobData } from "./types";

const WEEK_WIDTH = 48;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 24;
const LEFT_PANEL = 200;

// Colors per parent stage group
const GROUP_COLORS = [
  { bar: "bg-blue-500/80", bg: "bg-blue-50/30", hex: "rgba(59,130,246,0.8)" },
  { bar: "bg-indigo-500/80", bg: "bg-indigo-50/30", hex: "rgba(99,102,241,0.8)" },
  { bar: "bg-violet-500/80", bg: "bg-violet-50/30", hex: "rgba(139,92,246,0.8)" },
  { bar: "bg-cyan-500/80", bg: "bg-cyan-50/30", hex: "rgba(6,182,212,0.8)" },
  { bar: "bg-teal-500/80", bg: "bg-teal-50/30", hex: "rgba(20,184,166,0.8)" },
  { bar: "bg-emerald-500/80", bg: "bg-emerald-50/30", hex: "rgba(16,185,129,0.8)" },
  { bar: "bg-amber-500/80", bg: "bg-amber-50/30", hex: "rgba(245,158,11,0.8)" },
  { bar: "bg-rose-500/80", bg: "bg-rose-50/30", hex: "rgba(244,63,94,0.8)" },
];

interface OrderDot {
  id: string;
  orderWeek: number;
  deliveryWeek: number;
}

interface TimelineRow {
  type: "group-header" | "sub-job" | "flat-job";
  label: string;
  stageCode?: string;
  job?: TemplateJobData;
  parentJob?: TemplateJobData; // for collapsed group headers that need a bar
  groupIndex: number;
  weekRange?: string;
  orders?: TemplateJobData["orders"];
  orderDots?: OrderDot[]; // precomputed absolute week positions
  collapsed?: boolean; // true when this group-header is collapsed (show bar)
}

interface TemplateTimelineProps {
  jobs: TemplateJobData[];
  onJobUpdate?: (jobId: string, startWeek: number, endWeek: number) => void;
  expandedJobIds?: Set<string>;
  onToggleExpand?: (jobId: string) => void;
  onBarClick?: (jobId: string, parentJobId?: string) => void;
}

interface DragState {
  jobId: string;
  edge: "left" | "right";
  originalStartWeek: number;
  originalEndWeek: number;
  startX: number;
}

export function TemplateTimeline({ jobs, onJobUpdate, expandedJobIds, onToggleExpand, onBarClick }: TemplateTimelineProps) {
  if (jobs.length === 0) return null;

  // Use external expand state if provided, otherwise fallback to internal
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const effectiveExpanded = expandedJobIds ?? internalExpanded;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    jobId: string;
    startWeek: number;
    endWeek: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleGroup(jobId: string) {
    if (onToggleExpand) {
      onToggleExpand(jobId);
    } else {
      setInternalExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
        return next;
      });
    }
  }

  // Build rows: stages are collapsed by default, expanded on click
  const rows: TimelineRow[] = useMemo(() => {
    // Inline adjustWeek (pure fn, no dependencies outside args)
    const adj = (startWeek: number, raw: number) =>
      raw <= 0 && startWeek >= 1 ? raw - 1 : raw;

    const result: TimelineRow[] = [];
    jobs.forEach((parentJob, groupIdx) => {
      if (parentJob.children && parentJob.children.length > 0) {
        const isExpanded = effectiveExpanded.has(parentJob.id);
        // Precompute absolute order/delivery week positions for collapsed stage dots
        const orderDots: OrderDot[] = !isExpanded
          ? parentJob.children.flatMap((child) =>
              (child.orders ?? []).map((o) => ({
                id: `${child.id ?? child.name}-${o.id}`,
                orderWeek: adj(child.startWeek, child.startWeek + o.orderWeekOffset),
                deliveryWeek: adj(
                  child.startWeek,
                  child.startWeek + o.orderWeekOffset + o.deliveryWeekOffset
                ),
              }))
            )
          : [];
        // Group header row — always shown
        result.push({
          type: "group-header",
          label: parentJob.name,
          stageCode: parentJob.stageCode ?? undefined,
          parentJob,
          groupIndex: groupIdx,
          weekRange: `Wk ${parentJob.startWeek}–${parentJob.endWeek}`,
          collapsed: !isExpanded,
          orderDots,
        });
        // Sub-job rows — only when expanded
        if (isExpanded) {
          parentJob.children.forEach((child) => {
            result.push({
              type: "sub-job",
              label: child.name,
              stageCode: child.stageCode ?? undefined,
              job: child,
              groupIndex: groupIdx,
              orders: child.orders,
              orderDots: [],
            });
          });
        }
      } else {
        // Flat job (legacy/no children): precompute dots too
        result.push({
          type: "flat-job",
          label: parentJob.name,
          stageCode: parentJob.stageCode ?? undefined,
          job: parentJob,
          groupIndex: groupIdx,
          orders: parentJob.orders,
          orderDots: [],
        });
      }
    });
    return result;
  }, [jobs, effectiveExpanded]);

  // Calculate grid bounds — include pre-start weeks needed for order dots
  // Flatten ALL jobs including children of collapsed stages
  const allJobs: TemplateJobData[] = jobs.flatMap((j) =>
    j.children && j.children.length > 0 ? [j, ...j.children] : [j]
  );
  const maxWeek = Math.max(
    ...allJobs.map((j) => {
      const preview = dragPreview?.jobId === j.id ? dragPreview : null;
      return preview ? preview.endWeek : j.endWeek;
    }),
  );

  // Week numbers skip 0: ..., -2, -1, 1, 2, ...
  // Going back from a positive week across the boundary requires an extra -1 to jump over the missing 0.
  // e.g. startWeek=1, offset=-2 → raw=-1 → adjusted=-2 (2 weeks before Wk 1 is Wk -2)
  const adjustWeek = (startWeek: number, raw: number) =>
    raw <= 0 && startWeek >= 1 ? raw - 1 : raw;

  const allOrderWeeks = allJobs.flatMap((j) =>
    (j.orders ?? []).map((o) =>
      adjustWeek(j.startWeek, j.startWeek + o.orderWeekOffset)
    )
  );
  const gridStartWeek = allOrderWeeks.length > 0 ? Math.min(1, ...allOrderWeeks) : 1;

  // Pre-start columns (Wk -N … Wk -1) + positive columns (Wk 1 … Wk maxWeek) + padding
  // Week 0 is skipped, so if gridStartWeek < 1 we add (0 - gridStartWeek) pre-start cols
  const preStartCols = gridStartWeek < 1 ? -gridStartWeek : 0;
  const totalWeeks = preStartCols + maxWeek + 2;
  const timelineWidth = totalWeeks * WEEK_WIDTH;

  // Convert a week number to pixel offset, skipping the non-existent week 0
  const weekToLeft = (week: number): number => {
    if (gridStartWeek >= 1) return (week - gridStartWeek) * WEEK_WIDTH;
    if (week < 1) return (week - gridStartWeek) * WEEK_WIDTH;
    // Positive weeks: place after all pre-start columns (gap where 0 would be skipped)
    return (preStartCols + week - 1) * WEEK_WIDTH;
  };

  // Build week header list, skipping 0
  const weekHeaders: number[] = [];
  for (let col = 0; col < totalWeeks; col++) {
    const week = col < preStartCols ? gridStartWeek + col : col - preStartCols + 1;
    if (week !== 0) weekHeaders.push(week);
  }

  // All rows use ROW_HEIGHT (collapsed group headers need bar space too)
  const rowHeights = rows.map(() => ROW_HEIGHT);
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const rowYPositions = rowHeights.reduce<number[]>((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + rowHeights[i - 1]);
    return acc;
  }, []);
  const interactive = !!onJobUpdate;

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      jobId: string,
      edge: "left" | "right",
      job: TemplateJobData
    ) => {
      if (!interactive) return;
      e.preventDefault();
      e.stopPropagation();
      setDragState({
        jobId,
        edge,
        originalStartWeek: job.startWeek,
        originalEndWeek: job.endWeek,
        startX: e.clientX,
      });
      setDragPreview({
        jobId,
        startWeek: job.startWeek,
        endWeek: job.endWeek,
      });
    },
    [interactive]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const weekDelta = Math.round(dx / WEEK_WIDTH);

      let newStart = dragState.originalStartWeek;
      let newEnd = dragState.originalEndWeek;

      if (dragState.edge === "left") {
        newStart = Math.max(1, dragState.originalStartWeek + weekDelta);
        if (newStart > newEnd) newStart = newEnd;
      } else {
        newEnd = Math.max(1, dragState.originalEndWeek + weekDelta);
        if (newEnd < newStart) newEnd = newStart;
      }

      setDragPreview({
        jobId: dragState.jobId,
        startWeek: newStart,
        endWeek: newEnd,
      });
    },
    [dragState]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragState || !dragPreview || !onJobUpdate) return;

    const changed =
      dragPreview.startWeek !== dragState.originalStartWeek ||
      dragPreview.endWeek !== dragState.originalEndWeek;

    if (changed) {
      onJobUpdate(
        dragState.jobId,
        dragPreview.startWeek,
        dragPreview.endWeek
      );
    }

    setDragState(null);
    setDragPreview(null);
  }, [dragState, dragPreview, onJobUpdate]);

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Timeline Preview
        </h3>
        <p className="text-xs text-muted-foreground">
          {interactive
            ? "Drag bar edges to adjust week ranges"
            : "Click stages to expand sub-jobs"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div
          className="flex"
          style={{ minWidth: LEFT_PANEL + timelineWidth }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          ref={containerRef}
        >
          {/* Left panel - job/stage names */}
          <div
            className="shrink-0 border-r bg-slate-50/50"
            style={{ width: LEFT_PANEL }}
          >
            <div className="flex h-8 items-center border-b px-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Stage / Sub-Job
              </span>
            </div>

            {rows.map((row, idx) => {
              if (row.type === "group-header") {
                const isCollapsed = row.collapsed;
                return (
                  <div
                    key={`gh-${idx}`}
                    className="flex cursor-pointer items-center border-b border-slate-200 bg-slate-100/60 px-2 hover:bg-slate-100"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => toggleGroup(row.parentJob?.id ?? '')}
                  >
                    <span className="mr-1 text-slate-400">
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-slate-600">
                        {row.stageCode && (
                          <span className="mr-1.5 inline-block rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px]">
                            {row.stageCode}
                          </span>
                        )}
                        {row.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {row.weekRange}
                        {row.parentJob &&
                          row.parentJob.children &&
                          ` · ${row.parentJob.children.length} sub-jobs`}
                      </span>
                    </div>
                  </div>
                );
              }

              const job = row.job!;
              const preview =
                dragPreview?.jobId === job.id ? dragPreview : null;
              const sw = preview ? preview.startWeek : job.startWeek;
              const ew = preview ? preview.endWeek : job.endWeek;

              return (
                <div
                  key={job.id}
                  className="flex items-center border-b border-slate-100 px-3 pl-7"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs">
                      {row.stageCode && (
                        <span className="mr-1 font-mono text-[10px] font-medium text-slate-500">
                          {row.stageCode}
                        </span>
                      )}
                      {row.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Wk {sw}–{ew}
                      {job.durationWeeks && ` (${job.durationWeeks}wk)`}
                    </span>
                  </div>
                  {row.orders && row.orders.length > 0 && (
                    <span className="ml-1 flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Package className="size-3" />
                      {row.orders.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right panel - timeline */}
          <div className="relative flex-1">
            {/* Week headers */}
            <div className="flex h-8 border-b">
              {weekHeaders.map((week) => (
                <div
                  key={week}
                  className={`flex shrink-0 items-center justify-center border-r border-slate-100 text-[10px] font-medium ${week < 1 ? "text-amber-500" : "text-muted-foreground"}`}
                  style={{ width: WEEK_WIDTH }}
                >
                  {`Wk ${week}`}
                </div>
              ))}
            </div>

            {/* Grid + Bars */}
            <div className="relative" style={{ height: totalHeight }}>
              {/* Vertical gridlines */}
              {weekHeaders.map((week) => (
                <div
                  key={week}
                  className={`absolute top-0 border-r ${week < 1 ? "border-amber-100" : "border-slate-100"}`}
                  style={{
                    left: weekToLeft(week),
                    height: totalHeight,
                    width: 1,
                  }}
                />
              ))}

              {/* Row backgrounds */}
              {rows.map((row, idx) => {
                const colorSet =
                  GROUP_COLORS[row.groupIndex % GROUP_COLORS.length];
                return (
                  <div
                    key={idx}
                    className={`absolute left-0 right-0 border-b border-slate-100 ${
                      row.type === "group-header" && !row.collapsed
                        ? "bg-slate-100/40"
                        : row.type === "group-header" && row.collapsed
                          ? colorSet.bg
                          : idx % 2 === 1
                            ? colorSet.bg
                            : ""
                    }`}
                    style={{
                      top: rowYPositions[idx],
                      height: rowHeights[idx],
                    }}
                  />
                );
              })}

              {/* Gantt bars */}
              {rows.map((row, idx) => {
                // Collapsed group-header: render a summary bar for the whole stage + order dots
                if (row.type === "group-header" && row.collapsed && row.parentJob) {
                  const pj = row.parentJob;
                  const colorSet =
                    GROUP_COLORS[row.groupIndex % GROUP_COLORS.length];
                  const left = weekToLeft(pj.startWeek);
                  const width = (pj.endWeek - pj.startWeek + 1) * WEEK_WIDTH - 4;
                  const top = rowYPositions[idx] + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                  const rowTop = rowYPositions[idx];

                  return (
                    <div key={`collapsed-${idx}`}>
                      <div
                        className={`absolute rounded-md ${colorSet.bar} flex items-center px-2 shadow-sm cursor-pointer select-none`}
                        style={{
                          left: left + 2,
                          top,
                          width: Math.max(width, 20),
                          height: BAR_HEIGHT,
                        }}
                        onClick={() => toggleGroup(row.parentJob?.id ?? '')}
                      >
                        <span className="truncate text-[10px] font-medium text-white px-1">
                          {row.stageCode || row.label}
                        </span>
                      </div>
                      {row.orderDots?.map((dot) => (
                        <div key={dot.id}>
                          <div
                            className="absolute"
                            style={{
                              left: weekToLeft(dot.orderWeek) + WEEK_WIDTH / 2 - 4,
                              top: rowTop + 2,
                            }}
                            title={`Order: Wk ${dot.orderWeek}`}
                          >
                            <div className="size-2 rounded-full bg-orange-500 ring-1 ring-white" />
                          </div>
                          <div
                            className="absolute"
                            style={{
                              left: weekToLeft(dot.deliveryWeek) + WEEK_WIDTH / 2 - 4,
                              top: rowTop + ROW_HEIGHT - 10,
                            }}
                            title={`Delivery: Wk ${dot.deliveryWeek}`}
                          >
                            <div className="size-2 rounded-full bg-green-500 ring-1 ring-white" />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                // Expanded group-header: no bar (sub-jobs shown below)
                if (row.type === "group-header" || !row.job) return null;

                const job = row.job;
                const preview =
                  dragPreview?.jobId === job.id ? dragPreview : null;
                const sw = preview ? preview.startWeek : job.startWeek;
                const ew = preview ? preview.endWeek : job.endWeek;
                const isDragging = dragState?.jobId === job.id;
                const colorSet =
                  GROUP_COLORS[row.groupIndex % GROUP_COLORS.length];

                const left = weekToLeft(sw);
                const width = (ew - sw + 1) * WEEK_WIDTH - 4;
                const top =
                  rowYPositions[idx] +
                  (ROW_HEIGHT - BAR_HEIGHT) / 2;

                return (
                  <div key={job.id}>
                    {/* Job bar */}
                    <div
                      className={`absolute rounded-md ${colorSet.bar} flex items-center px-2 shadow-sm ${
                        isDragging
                          ? "ring-2 ring-blue-400 ring-offset-1"
                          : onBarClick ? "cursor-pointer hover:brightness-110" : ""
                      } ${interactive ? "select-none" : ""}`}
                      style={{
                        left: left + 2,
                        top,
                        width: Math.max(width, 20),
                        height: BAR_HEIGHT,
                      }}
                      onClick={(e) => {
                        // Only fire if this was a click, not the end of a drag
                        if (!dragPreview && onBarClick) {
                          e.stopPropagation();
                          const parentId = row.type === "sub-job" ? row.parentJob?.id : undefined;
                          onBarClick(job.id, parentId);
                        }
                      }}
                    >
                      {/* Left drag handle */}
                      {interactive && (
                        <div
                          className="absolute left-0 top-0 flex h-full w-2 cursor-col-resize items-center justify-center rounded-l-md hover:bg-white/30"
                          onMouseDown={(e) =>
                            handleMouseDown(e, job.id, "left", job)
                          }
                        >
                          <div className="h-3 w-0.5 rounded-full bg-white/60" />
                        </div>
                      )}

                      <span className="truncate text-[10px] font-medium text-white px-1">
                        {row.stageCode || job.name}
                      </span>

                      {/* Right drag handle */}
                      {interactive && (
                        <div
                          className="absolute right-0 top-0 flex h-full w-2 cursor-col-resize items-center justify-center rounded-r-md hover:bg-white/30"
                          onMouseDown={(e) =>
                            handleMouseDown(e, job.id, "right", job)
                          }
                        >
                          <div className="h-3 w-0.5 rounded-full bg-white/60" />
                        </div>
                      )}
                    </div>

                    {/* Order flag markers */}
                    {row.orders?.map((order) => {
                      const orderWeek = adjustWeek(
                        job.startWeek,
                        job.startWeek + order.orderWeekOffset
                      );
                      const deliveryWeek = adjustWeek(
                        job.startWeek,
                        job.startWeek + order.orderWeekOffset + order.deliveryWeekOffset
                      );
                      const rowTop = rowYPositions[idx];

                      return (
                        <div key={order.id}>
                          <div
                            className="absolute"
                            style={{
                              left: weekToLeft(orderWeek) + WEEK_WIDTH / 2 - 4,
                              top: rowTop + 2,
                            }}
                            title={`Order: Wk ${orderWeek}`}
                          >
                            <div className="size-2 rounded-full bg-orange-500 ring-1 ring-white" />
                          </div>
                          <div
                            className="absolute"
                            style={{
                              left: weekToLeft(deliveryWeek) + WEEK_WIDTH / 2 - 4,
                              top: rowTop + ROW_HEIGHT - 10,
                            }}
                            title={`Delivery: Wk ${deliveryWeek}`}
                          >
                            <div className="size-2 rounded-full bg-green-500 ring-1 ring-white" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 border-t px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="size-2 rounded-full bg-orange-500" />
                Order date
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="size-2 rounded-full bg-green-500" />
                Delivery date
              </div>
              {interactive && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-3 w-0.5 rounded bg-slate-400" />
                  Drag edges to resize
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ChevronRight className="size-3" />
                Click stage to expand
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
