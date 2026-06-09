"use client";

import type { TemplateData } from "./types";

/**
 * Mobile-only read-only programme preview. The desktop TemplateTimeline
 * uses a 200px-fixed-left panel + per-week columns that need horizontal
 * scrolling — unusable on a phone. This instead renders one proportional
 * bar per stage, scaled to fit the viewport width (no horizontal scroll),
 * so the user can VISUALISE the programme shape on mobile. Read-only;
 * editing stays in the dialogs + the desktop Gantt.
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

export function TemplateMobileTimeline({ template }: { template: TemplateData }) {
  const stages = template.jobs;
  if (stages.length === 0) return null;

  const minWeek = Math.min(...stages.map((s) => s.startWeek));
  const maxWeek = Math.max(...stages.map((s) => s.endWeek));
  const span = Math.max(1, maxWeek - minWeek + 1);

  return (
    <div className="rounded-lg border bg-white p-3 md:hidden">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Programme preview</h3>
        <span className="text-[11px] text-muted-foreground">
          {maxWeek} week{maxWeek === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {stages.map((stage, i) => {
          const left = ((stage.startWeek - minWeek) / span) * 100;
          const width = Math.max(
            5,
            ((stage.endWeek - stage.startWeek + 1) / span) * 100,
          );
          return (
            <div key={stage.id}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">
                  {i + 1}. {stage.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  wk {stage.startWeek}–{stage.endWeek}
                </span>
              </div>
              <div className="relative h-4 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className={`absolute top-0 h-4 rounded ${STAGE_COLORS[i % STAGE_COLORS.length]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${stage.name} — weeks ${stage.startWeek} to ${stage.endWeek}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t pt-1 text-[10px] text-muted-foreground">
        <span>Wk {minWeek}</span>
        <span>Wk {maxWeek}</span>
      </div>
    </div>
  );
}
