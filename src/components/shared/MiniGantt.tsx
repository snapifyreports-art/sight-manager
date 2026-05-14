"use client";

import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface MiniGanttJob {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
  live: boolean; // true = currently IN_PROGRESS, false = upcoming
}

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d), "dd MMM");
}

/**
 * Per-contractor mini Gantt — rows = plots, columns = 12 weeks starting
 * this Monday. Used on both the internal Contractor Comms card AND on
 * the contractor-facing share page so what Keith sees is exactly what
 * the contractor sees.
 *
 * Shared by extracting out of ContractorComms.tsx (Apr 2026 audit — was
 * local there, not reusable).
 *
 * Props:
 *   - `jobs`: all jobs to plot (already filtered to this contractor upstream).
 *   - `linkJobs`: when true, job bars are <Link>s to /jobs/:id (internal
 *     view). When false, bars render as non-clickable spans (share page
 *     — contractors can't open our job detail).
 *   - `linkPlots`: same but for the plot column. Internal view links to
 *     /sites/:id/plots/:plotId; share page leaves plot names as text.
 *   - `siteId`: only used when `linkPlots === true` to build the plot URL.
 */
export function MiniGantt({
  jobs,
  siteId,
  linkJobs = true,
  linkPlots = true,
}: {
  jobs: MiniGanttJob[];
  siteId: string;
  linkJobs?: boolean;
  linkPlots?: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const CELL_W = 44;
  const DAY_MS = 86400000;

  // (May 2026 Keith bug report) The window used to be a fixed 12 weeks
  // from today — so a contractor's jobs further out simply didn't render,
  // and the Mini Programme looked like they were only on a handful of
  // plots. Now the window spans the actual jobs it's given: from the
  // Monday on/before the earliest job (or today, whichever is sooner) to
  // the latest job end, with a 12-week minimum so a single-job
  // contractor isn't cramped.
  const datedJobs = jobs.filter((j) => j.startDate && j.endDate);
  const jobStartMs = datedJobs.map((j) => new Date(j.startDate!).getTime());
  const jobEndMs = datedJobs.map((j) => new Date(j.endDate!).getTime());
  const earliest = jobStartMs.length ? Math.min(...jobStartMs) : today.getTime();
  const latest = jobEndMs.length ? Math.max(...jobEndMs) : today.getTime();

  const startMonday = new Date(Math.min(today.getTime(), earliest));
  startMonday.setHours(0, 0, 0, 0);
  const day = startMonday.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  startMonday.setDate(startMonday.getDate() + diffToMon);

  const spanWeeks = Math.ceil(
    (Math.max(latest, today.getTime()) - startMonday.getTime()) / DAY_MS / 7,
  );
  const WEEKS_TO_SHOW = Math.max(12, spanWeeks + 1);

  const weekCols: Date[] = [];
  for (let i = 0; i < WEEKS_TO_SHOW; i++) {
    const d = new Date(startMonday);
    d.setDate(d.getDate() + i * 7);
    weekCols.push(d);
  }
  const rangeEnd = new Date(weekCols[weekCols.length - 1]);
  rangeEnd.setDate(rangeEnd.getDate() + 7);

  const byPlot = new Map<string, { plot: MiniGanttJob["plot"]; jobs: MiniGanttJob[] }>();
  for (const job of jobs) {
    if (!job.startDate || !job.endDate) continue;
    const js = new Date(job.startDate);
    const je = new Date(job.endDate);
    if (je < startMonday || js >= rangeEnd) continue;
    const entry = byPlot.get(job.plot.id) ?? { plot: job.plot, jobs: [] };
    entry.jobs.push(job);
    byPlot.set(job.plot.id, entry);
  }
  const plotRows = Array.from(byPlot.values()).sort((a, b) => {
    const an = a.plot.plotNumber ?? a.plot.name;
    const bn = b.plot.plotNumber ?? b.plot.name;
    return an.localeCompare(bn, undefined, { numeric: true });
  });

  if (plotRows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No scheduled jobs to show.
      </p>
    );
  }

  function barRect(job: MiniGanttJob) {
    const js = new Date(job.startDate!);
    const je = new Date(job.endDate!);
    const clampStart = js < startMonday ? startMonday : js;
    const clampEnd = je >= rangeEnd ? new Date(rangeEnd.getTime() - 1) : je;
    const dayMs = 86400000;
    const startDays = Math.max(0, (clampStart.getTime() - startMonday.getTime()) / dayMs);
    const endDays = Math.max(startDays + 1, (clampEnd.getTime() - startMonday.getTime()) / dayMs + 1);
    const widthDays = endDays - startDays;
    const left = (startDays / 7) * CELL_W;
    const width = Math.max(8, (widthDays / 7) * CELL_W - 2);
    return { left, width };
  }

  const todayOffset = ((today.getTime() - startMonday.getTime()) / 86400000 / 7) * CELL_W;

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <div className="flex sticky top-0 border-b bg-slate-50 text-[10px] font-medium text-muted-foreground">
        <div className="shrink-0 border-r px-2 py-1.5" style={{ width: 90 }}>
          Plot
        </div>
        <div className="relative flex-1" style={{ minWidth: WEEKS_TO_SHOW * CELL_W }}>
          <div className="flex">
            {weekCols.map((d, i) => (
              <div
                key={i}
                className="shrink-0 border-r text-center py-1.5 last:border-r-0"
                style={{ width: CELL_W }}
              >
                {format(d, "dd/MM")}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y">
        {plotRows.map(({ plot, jobs: plotJobs }) => (
          <div key={plot.id} className="flex items-stretch">
            <div
              className="shrink-0 border-r px-2 py-2 text-[11px] font-medium"
              style={{ width: 90 }}
            >
              {linkPlots ? (
                <Link
                  href={`/sites/${siteId}/plots/${plot.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {plotLabel(plot)}
                </Link>
              ) : (
                <span>{plotLabel(plot)}</span>
              )}
            </div>
            <div
              className="relative flex-1"
              style={{ minWidth: WEEKS_TO_SHOW * CELL_W, height: 28 }}
            >
              {todayOffset >= 0 && todayOffset <= WEEKS_TO_SHOW * CELL_W && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                  style={{ left: todayOffset }}
                  title="Today"
                />
              )}
              {plotJobs.map((job) => {
                const { left, width } = barRect(job);
                const className = cn(
                  "absolute top-1 bottom-1 flex items-center rounded px-1.5 text-[10px] font-medium truncate transition-all",
                  job.live
                    ? "bg-emerald-200 text-emerald-900"
                    : "bg-blue-100 text-blue-800",
                  linkJobs && (job.live ? "hover:bg-emerald-300" : "hover:bg-blue-200")
                );
                const title = `${job.name} · ${fmtDate(job.startDate)} – ${fmtDate(job.endDate)}`;
                const content = <span className="truncate">{job.name}</span>;
                if (linkJobs) {
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className={className}
                      style={{ left, width }}
                      title={title}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <span
                    key={job.id}
                    className={className}
                    style={{ left, width }}
                    title={title}
                  >
                    {content}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t bg-slate-50 px-2 py-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded bg-emerald-200" /> Live
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded bg-blue-100" /> Upcoming
        </span>
        <span className="flex items-center gap-1">
          <span className="block h-3 w-px bg-red-400" /> Today
        </span>
      </div>
    </div>
  );
}
