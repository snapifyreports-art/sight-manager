"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Package, Truck } from "lucide-react";
import type { TemplateData, TemplateJobData } from "./types";

/**
 * Mobile-only collapsible read-summary for a template. The desktop
 * Gantt + 200px-fixed-left layout is unusable below md (768px), so on
 * phones we hide it and show this list instead. Each stage expands to
 * show its sub-jobs and any orders attached to them.
 *
 * Read-only on purpose — the editing UI sits behind dialogs that DO
 * work on mobile (dialog text inputs are responsive). User can still
 * tap into a sub-job to edit it via the existing pencil icon on the
 * sub-job row, which is also mobile-friendly.
 */
export function TemplateMobileSummary({ template }: { template: TemplateData }) {
  const [openStages, setOpenStages] = useState<Set<string>>(
    () => new Set(template.jobs.map((j) => j.id)),
  );

  function toggle(id: string) {
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (template.jobs.length === 0) return null;

  const totalWeeks = Math.max(...template.jobs.map((j) => j.endWeek));

  return (
    <div className="space-y-2 md:hidden">
      <div className="rounded-lg border border-border/60 bg-slate-50 p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            Mobile summary view.
          </span>{" "}
          Tap a stage to expand. Use the desktop editor to drag-reorder
          stages or edit the Gantt visually.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white">
        {template.jobs.map((stage, i) => {
          const open = openStages.has(stage.id);
          const stageDays = computeStageWorkingDays(stage);
          return (
            <div key={stage.id} className={i > 0 ? "border-t" : ""}>
              <button
                type="button"
                onClick={() => toggle(stage.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
              >
                {open ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="flex-1 truncate text-sm font-medium">
                  {stage.name}
                </span>
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  w{stage.startWeek}-{stage.endWeek}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {stageDays}d
                </span>
              </button>

              {open && (
                <div className="space-y-1 bg-slate-50/30 px-3 pb-2 pl-9 pt-0.5">
                  {(stage.children ?? []).length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground">
                      Atomic stage — no sub-jobs.
                    </p>
                  ) : (
                    (stage.children ?? []).map((child) => (
                      <SubJobRow key={child.id} child={child} />
                    ))
                  )}
                  {(stage.orders ?? []).length > 0 && (
                    <div className="mt-1 space-y-0.5 rounded bg-emerald-50 px-2 py-1 text-[11px]">
                      <p className="font-medium text-emerald-800">
                        <Truck className="-mt-0.5 mr-1 inline size-3" />
                        {(stage.orders ?? []).length} stage-level order
                        {(stage.orders ?? []).length === 1 ? "" : "s"}
                      </p>
                      {(stage.orders ?? []).map((o) => (
                        <p key={o.id} className="text-emerald-700">
                          • {o.itemsDescription ?? "(no description)"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Total: {totalWeeks} week{totalWeeks === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function SubJobRow({ child }: { child: TemplateJobData }) {
  const days = childDays(child);
  return (
    <div className="rounded bg-white p-2 text-xs ring-1 ring-border/40">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 truncate font-medium">{child.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {days}d
        </span>
      </div>
      {(child.orders ?? []).length > 0 && (
        <div className="mt-1 space-y-0.5 text-[11px] text-emerald-700">
          {(child.orders ?? []).map((o) => (
            <p key={o.id}>
              <Package className="-mt-0.5 mr-1 inline size-3" />
              {o.itemsDescription ?? "(no description)"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function childDays(child: TemplateJobData): number {
  if (child.durationDays && child.durationDays > 0) return child.durationDays;
  if (child.durationWeeks && child.durationWeeks > 0)
    return child.durationWeeks * 5;
  return 0;
}

function computeStageWorkingDays(stage: TemplateJobData): number {
  const kids = stage.children ?? [];
  if (kids.length === 0) return childDays(stage);
  return kids.reduce((sum, c) => sum + childDays(c), 0);
}
