"use client";

import { useState, useRef, useCallback } from "react";
import { Package } from "lucide-react";
import type { TemplateJobData } from "./types";

const WEEK_WIDTH = 48;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 24;
const LEFT_PANEL = 180;

const JOB_COLORS = [
  "bg-blue-500/80",
  "bg-indigo-500/80",
  "bg-violet-500/80",
  "bg-cyan-500/80",
  "bg-teal-500/80",
  "bg-emerald-500/80",
  "bg-amber-500/80",
  "bg-rose-500/80",
];

const JOB_COLOR_HEX = [
  "rgba(59,130,246,0.8)",
  "rgba(99,102,241,0.8)",
  "rgba(139,92,246,0.8)",
  "rgba(6,182,212,0.8)",
  "rgba(20,184,166,0.8)",
  "rgba(16,185,129,0.8)",
  "rgba(245,158,11,0.8)",
  "rgba(244,63,94,0.8)",
];

interface TemplateTimelineProps {
  jobs: TemplateJobData[];
  onJobUpdate?: (jobId: string, startWeek: number, endWeek: number) => void;
}

interface DragState {
  jobId: string;
  edge: "left" | "right";
  originalStartWeek: number;
  originalEndWeek: number;
  startX: number;
}

export function TemplateTimeline({ jobs, onJobUpdate }: TemplateTimelineProps) {
  if (jobs.length === 0) return null;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    jobId: string;
    startWeek: number;
    endWeek: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxWeek = Math.max(...jobs.map((j) => {
    const preview = dragPreview?.jobId === j.id ? dragPreview : null;
    return preview ? preview.endWeek : j.endWeek;
  }));
  const totalWeeks = maxWeek + 1;
  const timelineWidth = totalWeeks * WEEK_WIDTH;
  const totalHeight = jobs.length * ROW_HEIGHT;
  const weekHeaders = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  const interactive = !!onJobUpdate;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, jobId: string, edge: "left" | "right", job: TemplateJobData) => {
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
      onJobUpdate(dragState.jobId, dragPreview.startWeek, dragPreview.endWeek);
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
            : "Relative week-based schedule"}
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
          {/* Left panel - job names */}
          <div
            className="shrink-0 border-r bg-slate-50/50"
            style={{ width: LEFT_PANEL }}
          >
            <div className="flex h-8 items-center border-b px-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Job
              </span>
            </div>

            {jobs.map((job) => {
              const preview =
                dragPreview?.jobId === job.id ? dragPreview : null;
              const sw = preview ? preview.startWeek : job.startWeek;
              const ew = preview ? preview.endWeek : job.endWeek;
              return (
                <div
                  key={job.id}
                  className="flex items-center border-b border-slate-100 px-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {job.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Wk {sw}–{ew}
                    </span>
                  </div>
                  {job.orders.length > 0 && (
                    <span className="ml-1 flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Package className="size-3" />
                      {job.orders.length}
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
                  className="flex shrink-0 items-center justify-center border-r border-slate-100 text-[10px] font-medium text-muted-foreground"
                  style={{ width: WEEK_WIDTH }}
                >
                  Wk {week}
                </div>
              ))}
            </div>

            {/* Grid + Bars */}
            <div className="relative" style={{ height: totalHeight }}>
              {/* Vertical gridlines */}
              {weekHeaders.map((week) => (
                <div
                  key={week}
                  className="absolute top-0 border-r border-slate-100"
                  style={{
                    left: (week - 1) * WEEK_WIDTH,
                    height: totalHeight,
                    width: 1,
                  }}
                />
              ))}

              {/* Horizontal row stripes */}
              {jobs.map((_, index) => (
                <div
                  key={index}
                  className={`absolute left-0 right-0 border-b border-slate-100 ${
                    index % 2 === 1 ? "bg-blue-50/20" : ""
                  }`}
                  style={{
                    top: index * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                />
              ))}

              {/* Gantt bars */}
              {jobs.map((job, index) => {
                const preview =
                  dragPreview?.jobId === job.id ? dragPreview : null;
                const sw = preview ? preview.startWeek : job.startWeek;
                const ew = preview ? preview.endWeek : job.endWeek;
                const isDragging = dragState?.jobId === job.id;

                const left = (sw - 1) * WEEK_WIDTH;
                const width = (ew - sw + 1) * WEEK_WIDTH - 4;
                const top =
                  index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                const color = JOB_COLORS[index % JOB_COLORS.length];

                return (
                  <div key={job.id}>
                    {/* Job bar */}
                    <div
                      className={`absolute rounded-md ${color} flex items-center px-2 shadow-sm ${
                        isDragging ? "ring-2 ring-blue-400 ring-offset-1" : ""
                      } ${interactive ? "select-none" : ""}`}
                      style={{
                        left: left + 2,
                        top,
                        width: Math.max(width, 20),
                        height: BAR_HEIGHT,
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
                        {job.name}
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
                    {job.orders.map((order) => {
                      const orderWeek =
                        job.startWeek + order.orderWeekOffset;
                      const deliveryWeek =
                        (job.startWeek + order.orderWeekOffset) + order.deliveryWeekOffset;
                      const rowTop = index * ROW_HEIGHT;

                      return (
                        <div key={order.id}>
                          {orderWeek >= 1 && (
                            <div
                              className="absolute"
                              style={{
                                left:
                                  (orderWeek - 1) * WEEK_WIDTH +
                                  WEEK_WIDTH / 2 -
                                  4,
                                top: rowTop + 2,
                              }}
                              title={`Order: Wk ${orderWeek}`}
                            >
                              <div className="size-2 rounded-full bg-orange-500 ring-1 ring-white" />
                            </div>
                          )}
                          {deliveryWeek >= 1 && (
                            <div
                              className="absolute"
                              style={{
                                left:
                                  (deliveryWeek - 1) * WEEK_WIDTH +
                                  WEEK_WIDTH / 2 -
                                  4,
                                top: rowTop + ROW_HEIGHT - 10,
                              }}
                              title={`Delivery: Wk ${deliveryWeek}`}
                            >
                              <div className="size-2 rounded-full bg-green-500 ring-1 ring-white" />
                            </div>
                          )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
