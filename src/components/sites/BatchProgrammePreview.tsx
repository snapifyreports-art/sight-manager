"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { addWorkingDays } from "@/lib/working-days";

interface PlotRow {
  plotNumber: string;
  batchIndex: number;
  startDate: string; // yyyy-mm-dd
  weeks: number;
}

interface Batch {
  id: string;
  mode: "blank" | "template";
  templateId: string;
  templateName: string;
  variantName?: string;
  plots: Array<{ plotNumber: string; startDate: string }>;
}

interface TemplateLite {
  id: string;
  jobs: Array<{ endWeek: number }>;
}

/**
 * Horizontal Gantt-style preview of every plot's build window across
 * the whole site timeline. Sits below the batch list in Step 2 of
 * CreateSiteWizard so the user can eyeball "are all my plots actually
 * spread out the way I wanted?" before clicking Create.
 *
 * Limitations (acceptable trade-offs for a quick preview):
 *
 *   - Weeks count comes from the BASE template's max endWeek, not the
 *     selected variant's. Variants typically scale ±15% (765 → 990 in
 *     the 2-storey), so the preview is "directionally right" but not
 *     pixel-accurate. A real programme view post-create reflects the
 *     correct per-variant durations.
 *   - Working-day end = startDate + (weeks × 5) working days. Doesn't
 *     model holidays / weather days that the cascade engine accounts
 *     for at apply time. Again, directional.
 *   - Blank-mode plots are skipped (no template, no duration). They
 *     don't show in the preview.
 *
 * Worth flagging: this is a PREVIEW. Don't use it to make scheduling
 * promises — just to spot "all 8 plots starting same day, that's
 * gonna jam the bricklayers" or "oh this one's three months late".
 */
export function BatchProgrammePreview({
  batches,
  templates,
}: {
  batches: Batch[];
  templates: TemplateLite[];
}) {
  const rows = useMemo<PlotRow[]>(() => {
    const out: PlotRow[] = [];
    batches.forEach((batch, batchIdx) => {
      if (batch.mode !== "template") return;
      const tpl = templates.find((t) => t.id === batch.templateId);
      const weeks = tpl
        ? Math.max(1, Math.max(...tpl.jobs.map((j) => j.endWeek)))
        : 1;
      for (const p of batch.plots) {
        if (!p.startDate) continue;
        out.push({
          plotNumber: p.plotNumber,
          batchIndex: batchIdx,
          startDate: p.startDate,
          weeks,
        });
      }
    });
    return out;
  }, [batches, templates]);

  // Site-level timeline: from earliest start to latest finish.
  const range = useMemo(() => {
    if (rows.length === 0) return null;
    let earliestMs = Infinity;
    let latestMs = -Infinity;
    for (const r of rows) {
      const start = new Date(r.startDate + "T00:00:00").getTime();
      const end = addWorkingDays(
        new Date(r.startDate + "T00:00:00"),
        r.weeks * 5 - 1,
      ).getTime();
      if (start < earliestMs) earliestMs = start;
      if (end > latestMs) latestMs = end;
    }
    const earliest = new Date(earliestMs);
    const latest = new Date(latestMs);
    // Total calendar days in the window — used to convert each row's
    // start/duration into a left/width %.
    const totalDays = Math.max(
      1,
      Math.round((latestMs - earliestMs) / (1000 * 60 * 60 * 24)) + 1,
    );
    return { earliest, latest, totalDays };
  }, [rows]);

  if (rows.length === 0 || !range) {
    return (
      <div className="rounded-lg border border-dashed bg-slate-50/50 p-3 text-center text-xs text-muted-foreground">
        Add a template-based plot batch to see the programme preview.
      </div>
    );
  }

  // Week tick marks across the top — every 4 weeks-worth of calendar
  // days so labels stay readable.
  const tickIntervalDays = Math.max(7, Math.ceil(range.totalDays / 12));
  const ticks: Array<{ day: number; label: string }> = [];
  for (let d = 0; d <= range.totalDays; d += tickIntervalDays) {
    const tickDate = new Date(range.earliest);
    tickDate.setDate(tickDate.getDate() + d);
    ticks.push({ day: d, label: format(tickDate, "d MMM") });
  }

  // Group colours — per-batch tint, cycling through 6 hues.
  const BATCH_COLORS = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-cyan-500",
  ];

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between text-xs">
        <p className="font-medium">
          Programme preview{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length} plot{rows.length === 1 ? "" : "s"} ·{" "}
            {format(range.earliest, "d MMM yyyy")} →{" "}
            {format(range.latest, "d MMM yyyy")})
          </span>
        </p>
        <span className="text-[10px] text-muted-foreground">
          Approximate — base-template durations
        </span>
      </div>

      {/* Tick row */}
      <div className="relative h-4 text-[9px] text-muted-foreground">
        {ticks.map((t) => (
          <span
            key={t.day}
            className="absolute -translate-x-1/2 select-none"
            style={{ left: `${(t.day / range.totalDays) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Plot rows */}
      <div className="space-y-1">
        {rows.map((r) => {
          const startMs = new Date(r.startDate + "T00:00:00").getTime();
          const offsetDays = Math.round(
            (startMs - range.earliest.getTime()) / (1000 * 60 * 60 * 24),
          );
          const endDate = addWorkingDays(
            new Date(r.startDate + "T00:00:00"),
            r.weeks * 5 - 1,
          );
          const widthDays = Math.max(
            1,
            Math.round(
              (endDate.getTime() -
                new Date(r.startDate + "T00:00:00").getTime()) /
                (1000 * 60 * 60 * 24),
            ) + 1,
          );
          const left = (offsetDays / range.totalDays) * 100;
          const width = (widthDays / range.totalDays) * 100;
          const color = BATCH_COLORS[r.batchIndex % BATCH_COLORS.length];

          return (
            <div
              key={`${r.batchIndex}-${r.plotNumber}`}
              className="flex items-center gap-2 text-[10px]"
            >
              <span className="w-12 shrink-0 truncate text-muted-foreground">
                Plot {r.plotNumber}
              </span>
              <div className="relative h-3.5 flex-1 rounded-sm bg-slate-100">
                <div
                  className={`absolute top-0 h-full rounded-sm ${color}/80`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: "2px",
                  }}
                  title={`Plot ${r.plotNumber} — ${format(new Date(r.startDate + "T00:00:00"), "d MMM yyyy")} → ${format(endDate, "d MMM yyyy")} (${r.weeks} wk)`}
                />
              </div>
              <span className="w-20 shrink-0 truncate text-[9px] text-muted-foreground">
                {format(new Date(r.startDate + "T00:00:00"), "d MMM")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
