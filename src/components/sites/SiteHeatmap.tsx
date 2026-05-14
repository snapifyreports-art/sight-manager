"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevDate } from "@/lib/dev-date-context";
import { AlertTriangle, Bug, Loader2, Package, TrendingUp, TrendingDown, Minus, PauseCircle } from "lucide-react";

interface HeatmapPlot {
  id: string;
  plotNumber: string | null;
  name: string;
  houseType: string | null;
  buildCompletePercent: number;
  totalJobs: number;
  completedJobs: number;
  overdueJobCount: number;
  maxOverdueDays: number;
  // (May 2026 Keith request) Overdue orders on this plot — late to send
  // or ORDERED past expected delivery. Shown as a badge on the tile.
  overdueOrderCount: number;
  openSnagCount: number;
  ragStatus: "green" | "amber" | "red" | "grey";
}

const RAG_STYLES: Record<string, { bg: string; border: string; bar: string }> = {
  green: { bg: "bg-green-50 hover:bg-green-100", border: "border-l-green-500", bar: "bg-green-500" },
  amber: { bg: "bg-amber-50 hover:bg-amber-100", border: "border-l-amber-500", bar: "bg-amber-500" },
  red: { bg: "bg-red-50 hover:bg-red-100", border: "border-l-red-500", bar: "bg-red-500" },
  grey: { bg: "bg-slate-50 hover:bg-slate-100", border: "border-l-slate-300", bar: "bg-slate-300" },
};

export function SiteHeatmap({ siteId }: { siteId: string }) {
  const { devDate } = useDevDate();
  const router = useRouter();
  const [plots, setPlots] = useState<HeatmapPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }>>({});

  useEffect(() => {
    // (May 2026 pattern sweep) Pre-fix the chained .then(.json) accepted
    // error payloads as data — heatmap rendered with the error shape
    // and `plot.id` access crashed. Now: guard with .ok and skip on fail.
    Promise.all([
      fetch(`/api/sites/${siteId}/heatmap`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/sites/${siteId}/plot-schedules`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([heatmap, schedules]) => {
      if (Array.isArray(heatmap)) setPlots(heatmap as HeatmapPlot[]);
      if (Array.isArray(schedules)) {
        const map: Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }> = {};
        for (const item of schedules as Array<{ plotId: string; status: string; daysDeviation: number; awaitingRestart: boolean }>) {
          map[item.plotId] = item;
        }
        setScheduleStatuses(map);
      }
    }).finally(() => setLoading(false));
  }, [siteId, devDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const counts = {
    green: plots.filter((p) => p.ragStatus === "green").length,
    amber: plots.filter((p) => p.ragStatus === "amber").length,
    red: plots.filter((p) => p.ragStatus === "red").length,
    grey: plots.filter((p) => p.ragStatus === "grey").length,
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-3">
        <span className="text-xs font-semibold text-muted-foreground">Legend:</span>
        {[
          { color: "bg-green-500", label: `On Track (${counts.green})` },
          { color: "bg-amber-500", label: `At Risk (${counts.amber})` },
          { color: "bg-red-500", label: `Delayed (${counts.red})` },
          { color: "bg-slate-300", label: `Not Started (${counts.grey})` },
        ].map((item) => (
          <span key={item.color} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-2.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
        {plots.map((plot) => {
          const styles = RAG_STYLES[plot.ragStatus];
          return (
            <button
              key={plot.id}
              onClick={() => router.push(`/sites/${siteId}/plots/${plot.id}`)}
              className={`rounded-lg border border-l-4 p-3 text-left transition-colors ${styles.bg} ${styles.border}`}
            >
              <div className="flex items-start justify-between">
                <span className="text-lg font-bold leading-tight">
                  {plot.plotNumber || plot.name.replace(/^Plot\s*/i, "") || "#"}
                </span>
                <div className="flex gap-1">
                  {plot.overdueJobCount > 0 && (
                    <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-600">
                      <AlertTriangle className="size-2.5" />
                      {plot.overdueJobCount}
                    </span>
                  )}
                  {plot.overdueOrderCount > 0 && (
                    <span
                      className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1 py-0.5 text-[9px] font-semibold text-blue-600"
                      title="Overdue orders — late to send or past expected delivery"
                    >
                      <Package className="size-2.5" />
                      {plot.overdueOrderCount}
                    </span>
                  )}
                  {plot.openSnagCount > 0 && (
                    <span className="flex items-center gap-0.5 rounded-full bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-600">
                      <Bug className="size-2.5" />
                      {plot.openSnagCount}
                    </span>
                  )}
                </div>
              </div>

              {plot.houseType && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {plot.houseType}
                </p>
              )}

              {/* Schedule deviation badge */}
              {scheduleStatuses[plot.id] && (() => {
                const s = scheduleStatuses[plot.id];
                if (s.awaitingRestart) return (
                  <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700">
                    <PauseCircle className="size-2" /> Paused
                  </span>
                );
                if (s.status === "ahead") return (
                  <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium text-emerald-700">
                    <TrendingUp className="size-2" /> {s.daysDeviation}d ahead
                  </span>
                );
                if (s.status === "behind") return (
                  <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium text-red-700">
                    <TrendingDown className="size-2" /> {Math.abs(s.daysDeviation)}d behind
                  </span>
                );
                if (s.status === "on_track") return (
                  <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-600">
                    <Minus className="size-2" /> On prog.
                  </span>
                );
                if (s.status === "idle") return (
                  <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-medium text-orange-700">
                    <PauseCircle className="size-2" /> Idle
                  </span>
                );
                return null;
              })()}

              {/* Progress bar */}
              <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${styles.bar}`}
                  style={{ width: `${Math.min(plot.buildCompletePercent, 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[9px] text-muted-foreground">
                {plot.completedJobs}/{plot.totalJobs} jobs &middot;{" "}
                {Math.round(plot.buildCompletePercent)}%
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
