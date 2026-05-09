"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Truck } from "lucide-react";
import { previewTemplateApply } from "@/lib/template-preview";
import type { TemplateData, TemplateJobData } from "@/components/settings/types";

/**
 * Relaxed shape — wizard's local `Template` type lacks a couple of
 * TemplateData fields (isDraft, timestamps) that the preview helper
 * doesn't actually use. Only the jobs tree matters.
 */
interface TemplateLike {
  id: string;
  jobs: TemplateJobData[];
}

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

interface PlotPreview {
  plotNumber: string;
  batchIndex: number;
  variantLabel: string | null;
  startDate: Date;
  endDate: Date;
  totalWeeks: number;
  orders: Array<{
    id: string;
    label: string;
    deliveryDate: Date;
  }>;
}

/**
 * Horizontal Gantt-style preview of every plot's build window across
 * the whole site timeline. Sits below the batch list in Step 2 of
 * CreateSiteWizard.
 *
 * Accuracy (May 2026 follow-up): the preview now uses the SELECTED
 * variant's own jobs/orders to compute per-plot durations and order
 * delivery dates, not the base template's. Falls back to base only
 * when no variant was picked. Variant /full data is fetched lazily
 * and cached the first time a variantId is seen.
 *
 * What the strip shows:
 *   - One row per plot.
 *   - Bar = build window, length matches the variant's actual span.
 *   - Per-batch colour so groups are visually clustered.
 *   - Truck markers on each bar at every order's computed arrival
 *     date — eyeball "are 4 deliveries landing the same week across
 *     5 plots? supplier is gonna struggle".
 *   - Hover any bar / marker for exact details.
 */
export function BatchProgrammePreview({
  batches,
  templates,
}: {
  batches: Batch[];
  templates: TemplateLike[];
}) {
  // Cache variant /full data by variantId. Hits the new
  // /api/plot-templates/[id]/variants/[variantId]/full endpoint which
  // returns variant data shaped like a TemplateData.
  const [variantData, setVariantData] = useState<Record<string, TemplateData>>(
    {},
  );
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Find every (templateId, variantId) pair that needs fetching.
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
          for (const r of results) {
            if (r) next[r.variantId] = r.data;
          }
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

  // Build the per-plot preview rows once we have all the data we need.
  const rows = useMemo<PlotPreview[]>(() => {
    const out: PlotPreview[] = [];
    batches.forEach((batch, batchIdx) => {
      if (batch.mode !== "template") return;
      // Resolve the right TemplateData for this batch's scope.
      const baseTpl = templates.find((t) => t.id === batch.templateId);
      const variantTpl = batch.variantId
        ? variantData[batch.variantId]
        : null;
      // Cast to TemplateData for previewTemplateApply — only `.jobs`
      // is read so the missing TemplateData-only fields don't matter.
      const tplForCompute = (variantTpl ?? baseTpl) as TemplateData | undefined;
      // Variant chosen but its /full hasn't loaded yet — skip rather
      // than draw a misleading base-template-shaped bar.
      if (batch.variantId && !variantTpl) return;
      if (!tplForCompute) return;

      for (const p of batch.plots) {
        if (!p.startDate) continue;
        const startDate = new Date(p.startDate + "T00:00:00");
        const preview = previewTemplateApply(tplForCompute, startDate);
        out.push({
          plotNumber: p.plotNumber,
          batchIndex: batchIdx,
          variantLabel: batch.variantName ?? null,
          startDate: preview.startDate,
          endDate: preview.endDate,
          totalWeeks: preview.totalWeeks,
          orders: preview.orders.map((o) => ({
            id: o.id,
            label: `${o.itemsDescription} → ${o.jobName}`,
            deliveryDate: o.deliveryDate,
          })),
        });
      }
    });
    return out;
  }, [batches, templates, variantData]);

  // Site-level timeline window.
  const range = useMemo(() => {
    if (rows.length === 0) return null;
    let earliestMs = Infinity;
    let latestMs = -Infinity;
    for (const r of rows) {
      const start = r.startDate.getTime();
      const end = r.endDate.getTime();
      if (start < earliestMs) earliestMs = start;
      if (end > latestMs) latestMs = end;
      // Order arrivals can fall before the build start (anchored
      // BEFORE the first job) — extend the window to cover them.
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

  // Tick marks across the top — every ~1/12th of the window.
  const tickIntervalDays = Math.max(7, Math.ceil(range.totalDays / 12));
  const ticks: Array<{ day: number; label: string }> = [];
  for (let d = 0; d <= range.totalDays; d += tickIntervalDays) {
    const tickDate = new Date(range.earliest);
    tickDate.setDate(tickDate.getDate() + d);
    ticks.push({ day: d, label: format(tickDate, "d MMM") });
  }

  const BATCH_COLORS = [
    { bar: "bg-blue-500", border: "border-blue-600" },
    { bar: "bg-emerald-500", border: "border-emerald-600" },
    { bar: "bg-amber-500", border: "border-amber-600" },
    { bar: "bg-violet-500", border: "border-violet-600" },
    { bar: "bg-rose-500", border: "border-rose-600" },
    { bar: "bg-cyan-500", border: "border-cyan-600" },
  ];

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
          deliveries shown per plot
        </span>
      </div>

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

      <div className="space-y-1">
        {rows.map((r) => {
          const offsetDays = dayDiff(range.earliest, r.startDate);
          const widthDays = Math.max(1, dayDiff(r.startDate, r.endDate) + 1);
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
              <div className="relative h-4 flex-1 rounded-sm bg-slate-100">
                {/* Build-window bar */}
                <div
                  className={`absolute top-0 h-full rounded-sm ${color.bar}/80`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: "2px",
                  }}
                  title={`Plot ${r.plotNumber}${r.variantLabel ? ` (${r.variantLabel})` : ""} — ${format(r.startDate, "d MMM yyyy")} → ${format(r.endDate, "d MMM yyyy")} (${r.totalWeeks} wk)`}
                />
                {/* Order delivery markers — small green truck dots
                    sitting above the bar at each delivery date. */}
                {r.orders.map((o) => {
                  const dOffset = dayDiff(range.earliest, o.deliveryDate);
                  const dLeft = (dOffset / range.totalDays) * 100;
                  return (
                    <span
                      key={o.id}
                      className="absolute top-0.5 -translate-x-1/2"
                      style={{ left: `${dLeft}%` }}
                      title={`${format(o.deliveryDate, "d MMM yyyy")} — ${o.label}`}
                    >
                      <Truck className="size-3 text-emerald-700" strokeWidth={2.5} />
                    </span>
                  );
                })}
              </div>
              <span className="w-20 shrink-0 truncate text-[9px] text-muted-foreground">
                {format(r.startDate, "d MMM")}
                {r.variantLabel ? ` · ${r.variantLabel}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
