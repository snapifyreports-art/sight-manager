"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Truck } from "lucide-react";
import { previewTemplateApply } from "@/lib/template-preview";
import { addWorkingDays } from "@/lib/working-days";
import type { TemplateData, TemplateJobData } from "@/components/settings/types";

interface BatchPlot {
  plotNumber: string;
  startDate: string;
}

interface Batch {
  id: string;
  mode: "blank" | "template";
  templateId: string;
  variantId: string;
  templateName: string;
  variantName?: string;
  plots: BatchPlot[];
}

interface TemplateLike {
  id: string;
  name: string;
  jobs: TemplateJobData[];
}

interface PlotPreviewSegment {
  /** Stage name for hover tooltip + label. */
  name: string;
  /** Calendar offset (days) from the plot's startDate. */
  offsetDays: number;
  /** Calendar width (days) of this stage. */
  widthDays: number;
  /** Index used for the colour palette. */
  stageIndex: number;
}

interface PlotRow {
  plotNumber: string;
  batchIndex: number;
  templateName: string;
  variantLabel: string | null;
  startDate: Date;
  endDate: Date;
  segments: PlotPreviewSegment[];
  orders: Array<{ id: string; label: string; deliveryDate: Date }>;
}

const STAGE_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
];

/**
 * Programme preview that mirrors TemplateTimeline's stage-breakdown
 * style. Each plot row shows its variant's stages as butted-up coloured
 * blocks (back-to-back, no gaps unless the variant data itself has
 * gaps — which is a separate bug to fix). Hover any segment for stage
 * name + working-day length. Truck markers float above the bar at
 * each order's delivery date.
 *
 * Plots are sorted chronologically by start date — earliest at the
 * top — rather than by batch order, so the user sees the build
 * sequence at a glance.
 *
 * Each row is also labelled with template + variant so it's clear
 * which flavour each plot was assigned.
 */
export function BatchProgrammePreview({
  batches,
  templates,
}: {
  batches: Batch[];
  templates: TemplateLike[];
}) {
  // Variant /full data cache — keyed by variantId.
  const [variantData, setVariantData] = useState<Record<string, TemplateData>>(
    {},
  );
  const [loadingVariants, setLoadingVariants] = useState(false);

  const variantsNeeded = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ templateId: string; variantId: string }> = [];
    for (const b of batches) {
      if (b.mode !== "template" || !b.variantId) continue;
      if (seen.has(b.variantId)) continue;
      seen.add(b.variantId);
      list.push({ templateId: b.templateId, variantId: b.variantId });
    }
    return list;
  }, [batches]);

  useEffect(() => {
    const missing = variantsNeeded.filter((v) => !variantData[v.variantId]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoadingVariants(true);
    Promise.all(
      missing.map(async (v) => {
        const res = await fetch(
          `/api/plot-templates/${v.templateId}/variants/${v.variantId}/full`,
          { cache: "no-store" },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as TemplateData;
        return { variantId: v.variantId, data };
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setVariantData((prev) => {
          const next = { ...prev };
          for (const r of results) if (r) next[r.variantId] = r.data;
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingVariants(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variantsNeeded, variantData]);

  // Build per-plot rows with stage segments + orders + chronological sort.
  const rows = useMemo<PlotRow[]>(() => {
    const out: PlotRow[] = [];
    batches.forEach((batch, batchIdx) => {
      if (batch.mode !== "template") return;
      const baseTpl = templates.find((t) => t.id === batch.templateId);
      const variantTpl = batch.variantId ? variantData[batch.variantId] : null;
      // Variant chosen but its /full hasn't loaded yet — skip the row
      // rather than draw a misleading base-shaped bar.
      if (batch.variantId && !variantTpl) return;
      const tplForCompute = (variantTpl ?? baseTpl) as TemplateData | undefined;
      if (!tplForCompute) return;

      for (const p of batch.plots) {
        if (!p.startDate) continue;
        const startDate = new Date(p.startDate + "T00:00:00");
        const preview = previewTemplateApply(tplForCompute, startDate);

        // Walk top-level stages, day-cursor-packed (mirrors the
        // TemplateTimeline logic). Each stage's width is its
        // children's total working days, OR the stage's own
        // durationDays if atomic. This keeps stages back-to-back
        // even when the cached startWeek/endWeek on the variant has
        // drifted (the cache doesn't drive layout here — the
        // canonical durationDays does).
        const segments: PlotPreviewSegment[] = [];
        let dayCursor = 0;
        tplForCompute.jobs.forEach((stage, stageIdx) => {
          const days = stageWorkingDays(stage);
          if (days <= 0) return;
          // Convert working-day offset to calendar-day offset using
          // addWorkingDays so weekends are accounted for the same way
          // the cascade engine treats them at apply time.
          const segStart = addWorkingDays(startDate, dayCursor);
          const segEnd = addWorkingDays(startDate, dayCursor + days - 1);
          const offsetDays = dayDiff(startDate, segStart);
          const widthDays = Math.max(1, dayDiff(segStart, segEnd) + 1);
          segments.push({
            name: stage.name,
            offsetDays,
            widthDays,
            stageIndex: stageIdx,
          });
          dayCursor += days;
        });

        const variantLabel = batch.variantName ?? null;
        out.push({
          plotNumber: p.plotNumber,
          batchIndex: batchIdx,
          templateName: batch.templateName,
          variantLabel,
          startDate: preview.startDate,
          endDate: preview.endDate,
          segments,
          orders: preview.orders.map((o) => ({
            id: o.id,
            label: `${o.itemsDescription} → ${o.jobName}`,
            deliveryDate: o.deliveryDate,
          })),
        });
      }
    });
    // Chronological order: earliest start first; tie-break by plot
    // number for deterministic rendering.
    out.sort((a, b) => {
      const t = a.startDate.getTime() - b.startDate.getTime();
      if (t !== 0) return t;
      return a.plotNumber.localeCompare(b.plotNumber, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return out;
  }, [batches, templates, variantData]);

  // Site-level window — earliest start (or earliest order arrival,
  // for orders anchored before site activity) to latest end.
  const range = useMemo(() => {
    if (rows.length === 0) return null;
    let earliestMs = Infinity;
    let latestMs = -Infinity;
    for (const r of rows) {
      earliestMs = Math.min(earliestMs, r.startDate.getTime());
      latestMs = Math.max(latestMs, r.endDate.getTime());
      for (const o of r.orders) {
        const od = o.deliveryDate.getTime();
        if (od < earliestMs) earliestMs = od;
        if (od > latestMs) latestMs = od;
      }
    }
    const earliest = new Date(earliestMs);
    const latest = new Date(latestMs);
    const totalDays = Math.max(
      1,
      Math.round((latestMs - earliestMs) / (1000 * 60 * 60 * 24)) + 1,
    );
    return { earliest, latest, totalDays };
  }, [rows]);

  if (rows.length === 0 || !range) {
    if (loadingVariants) {
      return (
        <div className="rounded-lg border border-dashed bg-slate-50/50 p-3 text-center text-xs text-muted-foreground">
          Loading variant data for the programme preview…
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-slate-50/50 p-3 text-center text-xs text-muted-foreground">
        Add a template-based plot batch to see the programme preview.
      </div>
    );
  }

  // Tick marks at calendar-week intervals when the window is short,
  // monthly when it's long, so labels stay readable.
  const tickIntervalDays =
    range.totalDays <= 90 ? 7 : range.totalDays <= 365 ? 28 : 90;
  const ticks: Array<{ day: number; label: string }> = [];
  for (let d = 0; d <= range.totalDays; d += tickIntervalDays) {
    const tickDate = new Date(range.earliest);
    tickDate.setDate(tickDate.getDate() + d);
    ticks.push({
      day: d,
      label:
        tickIntervalDays >= 28
          ? format(tickDate, "MMM yy")
          : format(tickDate, "d MMM"),
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <p className="font-medium">
          Programme preview{" "}
          <span className="font-normal text-muted-foreground">
            ({rows.length} plot{rows.length === 1 ? "" : "s"} ·{" "}
            {format(range.earliest, "d MMM yyyy")} →{" "}
            {format(range.latest, "d MMM yyyy")})
          </span>
        </p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Truck className="size-3 text-emerald-600" />
          deliveries shown per plot · sorted chronologically
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

      {/* Vertical grid behind the rows for visual rhythm */}
      <div className="relative">
        <div className="absolute inset-0 pointer-events-none">
          {ticks.map((t) => (
            <div
              key={t.day}
              className="absolute top-0 bottom-0 w-px bg-slate-100"
              style={{ left: `${(t.day / range.totalDays) * 100}%` }}
            />
          ))}
        </div>

        <div className="relative space-y-1">
          {rows.map((r) => {
            const offsetDays = dayDiff(range.earliest, r.startDate);
            const widthDays = Math.max(1, dayDiff(r.startDate, r.endDate) + 1);
            const left = (offsetDays / range.totalDays) * 100;
            const width = (widthDays / range.totalDays) * 100;

            return (
              <div
                key={`${r.batchIndex}-${r.plotNumber}`}
                className="flex items-center gap-2 text-[10px]"
              >
                <span className="w-12 shrink-0 truncate text-muted-foreground">
                  Plot {r.plotNumber}
                </span>
                <div className="relative h-5 flex-1 rounded-sm bg-slate-50">
                  {/* Stage segments — each one is a coloured block
                      rendered at its working-day offset within the
                      plot's window. Adjacent stages butt right up
                      against each other. Half-blocks for short
                      stages happen automatically because widthDays
                      is in calendar days, not whole weeks. */}
                  <div
                    className="absolute top-0 h-full"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {r.segments.map((seg, i) => {
                      const segLeft = (seg.offsetDays / widthDays) * 100;
                      const segWidth = (seg.widthDays / widthDays) * 100;
                      const color =
                        STAGE_COLORS[seg.stageIndex % STAGE_COLORS.length];
                      return (
                        <div
                          key={i}
                          className={`absolute top-0 h-full border-r border-white/60 ${color}/85 first:rounded-l-sm last:rounded-r-sm last:border-r-0`}
                          style={{
                            left: `${segLeft}%`,
                            width: `${segWidth}%`,
                            minWidth: "2px",
                          }}
                          title={`${seg.name} · ${seg.widthDays} day${seg.widthDays === 1 ? "" : "s"}`}
                        />
                      );
                    })}
                  </div>
                  {/* Order delivery markers */}
                  {r.orders.map((o) => {
                    const dOffset = dayDiff(range.earliest, o.deliveryDate);
                    const dLeft = (dOffset / range.totalDays) * 100;
                    return (
                      <span
                        key={o.id}
                        className="absolute -top-0.5 -translate-x-1/2"
                        style={{ left: `${dLeft}%` }}
                        title={`${format(o.deliveryDate, "d MMM yyyy")} — ${o.label}`}
                      >
                        <Truck
                          className="size-3 text-emerald-700"
                          strokeWidth={2.5}
                        />
                      </span>
                    );
                  })}
                </div>
                <span
                  className="w-32 shrink-0 truncate text-[9px] text-muted-foreground"
                  title={`${r.templateName}${r.variantLabel ? ` · ${r.variantLabel}` : ""}`}
                >
                  {format(r.startDate, "d MMM")}
                  {" · "}
                  <span className="text-foreground/70">
                    {r.variantLabel ?? "base"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function stageWorkingDays(stage: TemplateJobData): number {
  const kids = stage.children ?? [];
  if (kids.length > 0) {
    return kids.reduce((sum, c) => sum + childDays(c), 0);
  }
  // Atomic stage — use its own duration field.
  if (stage.durationDays && stage.durationDays > 0) return stage.durationDays;
  if (stage.durationWeeks && stage.durationWeeks > 0)
    return stage.durationWeeks * 5;
  return 0;
}

function childDays(c: TemplateJobData): number {
  if (c.durationDays && c.durationDays > 0) return c.durationDays;
  if (c.durationWeeks && c.durationWeeks > 0) return c.durationWeeks * 5;
  return 0;
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
