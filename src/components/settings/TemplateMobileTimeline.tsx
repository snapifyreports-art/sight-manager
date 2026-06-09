"use client";

import { useState, useMemo } from "react";
import type { TemplateData, TemplateJobData, TemplateInspectionData } from "./types";
import { computeInspectionMarkers } from "./template-inspection-markers";

/**
 * Mobile-only read-only programme preview. The desktop TemplateTimeline
 * uses a 200px-fixed-left panel + per-week columns that need horizontal
 * scrolling — unusable on a phone. This instead renders proportional bars
 * scaled to fit the viewport width (no horizontal scroll).
 *
 * (Jun 2026) Two additions Keith asked for:
 *  - a Weeks/Days toggle — Weeks shows one bar per STAGE (the overview);
 *    Days drills into the leaf sub-jobs so a 3-day task is actually
 *    visible rather than smeared into a week.
 *  - inspection "!" hold-point markers, positioned the same way as the
 *    live plot Gantts so you can see WHERE each NHBC/Building-Control
 *    inspection lands before applying the template.
 */

const STAGE_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
];

// Working days per week — the canonical conversion used across the app.
const DPW = 5;

interface Bar {
  id: string;
  label: string;
  /** Stage index for colour. */
  groupIndex: number;
  dayStart: number;
  dayLen: number;
  indented: boolean;
  rangeLabel: string;
}

export function TemplateMobileTimeline({
  template,
  inspections = [],
}: {
  template: TemplateData;
  inspections?: TemplateInspectionData[];
}) {
  const [viewMode, setViewMode] = useState<"weeks" | "days">("weeks");
  const stages = template.jobs;

  // Day span of a job from its week grid + canonical durationDays.
  const jobDayStart = (j: TemplateJobData) => (j.startWeek - 1) * DPW;
  const jobDayLen = (j: TemplateJobData) =>
    j.durationDays && j.durationDays > 0
      ? j.durationDays
      : Math.max(1, j.endWeek - j.startWeek + 1) * DPW;

  const bars = useMemo<Bar[]>(() => {
    const out: Bar[] = [];
    stages.forEach((stage, i) => {
      if (viewMode === "weeks" || !stage.children?.length) {
        out.push({
          id: stage.id,
          label: stage.name,
          groupIndex: i,
          dayStart: jobDayStart(stage),
          dayLen: jobDayLen(stage),
          indented: false,
          rangeLabel:
            viewMode === "weeks"
              ? `wk ${stage.startWeek}–${stage.endWeek}`
              : `${jobDayLen(stage)}d`,
        });
      } else {
        // Days view: drill into leaf sub-jobs so fine-grained tasks show.
        stage.children.forEach((child) => {
          out.push({
            id: child.id,
            label: child.name,
            groupIndex: i,
            dayStart: jobDayStart(child),
            dayLen: jobDayLen(child),
            indented: true,
            rangeLabel: `${jobDayLen(child)}d`,
          });
        });
      }
    });
    return out;
  }, [stages, viewMode]);

  const markers = useMemo(
    () => computeInspectionMarkers(stages, inspections),
    [stages, inspections],
  );

  if (stages.length === 0) return null;

  // Total programme span in working days (cover bars + any marker day).
  const maxDay = Math.max(
    1,
    ...bars.map((b) => b.dayStart + b.dayLen),
    ...markers.map((m) => m.day + 1),
  );
  const totalWeeks = Math.max(...stages.map((s) => s.endWeek));

  return (
    <div className="rounded-lg border bg-white p-3 md:hidden">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Programme preview</h3>
        <div className="flex items-center gap-2">
          {markers.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
              <span className="flex size-3.5 items-center justify-center rounded-sm bg-amber-500 text-[9px] font-bold leading-none text-white">!</span>
              {markers.length} insp
            </span>
          )}
          <div className="flex items-center rounded-md border p-0.5">
            {(["weeks", "days"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                  viewMode === m ? "bg-slate-800 text-white" : "text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Marker strip — "!" badges along the top, aligned to the bars below. */}
      {markers.length > 0 && (
        <div className="relative mb-1 h-4">
          {markers.map((mk) => (
            <div
              key={mk.id}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${Math.min(100, Math.max(0, (mk.day / maxDay) * 100))}%` }}
              title={`${mk.name} — ${mk.type} · anchored ${mk.edgeLabel}`}
            >
              <span className="flex size-4 items-center justify-center rounded-sm bg-amber-500 text-[10px] font-bold leading-none text-white shadow">!</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {bars.map((bar) => {
          const left = (bar.dayStart / maxDay) * 100;
          const width = Math.max(4, (bar.dayLen / maxDay) * 100);
          return (
            <div key={bar.id}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                <span className={`truncate ${bar.indented ? "pl-3 text-muted-foreground" : "font-medium"}`}>
                  {bar.indented ? "– " : ""}{bar.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{bar.rangeLabel}</span>
              </div>
              <div className="relative h-3.5 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`absolute top-0 h-3.5 rounded ${STAGE_COLORS[bar.groupIndex % STAGE_COLORS.length]} ${bar.indented ? "opacity-70" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${bar.label} — ${bar.rangeLabel}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t pt-1 text-[10px] text-muted-foreground">
        <span>{viewMode === "weeks" ? "Wk 1" : "Day 1"}</span>
        <span>{viewMode === "weeks" ? `Wk ${totalWeeks}` : `${maxDay} days`}</span>
      </div>
    </div>
  );
}
