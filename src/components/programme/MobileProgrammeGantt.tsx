"use client";

import { format, addDays, startOfWeek, differenceInCalendarDays } from "date-fns";
import { getCurrentDateAtMidnight } from "@/lib/dev-date";

/**
 * (#178) Mobile Gantt strip — the "where's the Gantt gone" answer.
 *
 * The desktop SiteProgramme renders a 12-column-wide left header plus
 * a day-by-day timeline, which is unusable on a phone. The
 * MobileProgramme card list (May 2026) replaced it with status cards,
 * which is good for "what stage is each plot at" but doesn't answer
 * "what does the next two months look like across the site".
 *
 * This component is the compromise: one row per plot, a sticky-ish
 * label on the left, and a horizontally scrolling week strip on the
 * right. Each cell = one week. Cell colour = the dominant stage in
 * that week (IN_PROGRESS wins, then ON_HOLD, then COMPLETED, then
 * NOT_STARTED). Today's week is highlighted with a vertical line.
 *
 * The cells are tap-through to plot detail — no per-job interaction
 * in this view (that's PlotDetailClient's job).
 */

interface ProgrammeJob {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}
interface ProgrammePlot {
  id: string;
  name: string;
  plotNumber: string | null;
  houseType: string | null;
  buildCompletePercent: number;
  jobs: ProgrammeJob[];
}
interface ProgrammeSite {
  id: string;
  name: string;
  plots: ProgrammePlot[];
}

type WeekStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "EMPTY";

const STATUS_BG: Record<WeekStatus, string> = {
  EMPTY: "bg-slate-50",
  NOT_STARTED: "bg-slate-200",
  IN_PROGRESS: "bg-blue-400",
  ON_HOLD: "bg-amber-300",
  COMPLETED: "bg-emerald-400",
};

const STATUS_RANK: Record<string, number> = {
  IN_PROGRESS: 4,
  ON_HOLD: 3,
  COMPLETED: 2,
  NOT_STARTED: 1,
};

/**
 * For one plot + one week (startOfWeek..startOfWeek+6 days), return
 * the dominant job status for that week. "Dominant" means the highest-
 * priority status of any job that overlaps any day in the week.
 */
function dominantWeekStatus(
  jobs: ProgrammeJob[],
  weekStart: Date,
  weekEnd: Date,
): WeekStatus {
  let best: { status: string; rank: number } | null = null;
  for (const j of jobs) {
    if (!j.startDate || !j.endDate) continue;
    const start = new Date(j.startDate);
    const end = new Date(j.endDate);
    if (end < weekStart || start > weekEnd) continue;
    const rank = STATUS_RANK[j.status] ?? 0;
    if (!best || rank > best.rank) best = { status: j.status, rank };
  }
  return (best?.status as WeekStatus) ?? "EMPTY";
}

const WEEK_COUNT = 12;
const CELL_W = 32; // px per week column
const ROW_H = 36;
const LABEL_W = 92;

interface Props {
  data: ProgrammeSite;
}

export function MobileProgrammeGantt({ data }: Props) {
  const today = getCurrentDateAtMidnight();
  // Anchor the strip at "this week" so today is always visible.
  // weekStartsOn 1 = Monday.
  const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  // Start 2 weeks BEFORE today so a little history is visible.
  const stripStart = addDays(thisWeekStart, -14);

  const weeks = Array.from({ length: WEEK_COUNT }, (_, i) =>
    addDays(stripStart, i * 7),
  );
  const todayOffsetDays = differenceInCalendarDays(today, stripStart);
  const todayPxOffset = (todayOffsetDays / 7) * CELL_W;

  const plots = [...data.plots].sort((a, b) => {
    const an = a.plotNumber || a.name;
    const bn = b.plotNumber || b.name;
    return an.localeCompare(bn, undefined, { numeric: true });
  });

  return (
    <div className="rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <div style={{ width: LABEL_W + WEEK_COUNT * CELL_W }}>
          {/* Week header */}
          <div
            className="sticky top-0 z-10 flex border-b bg-slate-50 text-[9px] font-medium text-slate-500"
            style={{ paddingLeft: LABEL_W }}
          >
            {weeks.map((w, i) => {
              const isThisWeek =
                w.getTime() === thisWeekStart.getTime();
              return (
                <div
                  key={i}
                  className={`flex h-7 shrink-0 items-center justify-center border-r ${
                    isThisWeek ? "bg-blue-50 font-semibold text-blue-700" : ""
                  }`}
                  style={{ width: CELL_W }}
                >
                  {format(w, "d MMM")}
                </div>
              );
            })}
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Today vertical line */}
            <div
              className="pointer-events-none absolute top-0 z-20 w-px bg-red-400"
              style={{
                left: LABEL_W + todayPxOffset,
                height: plots.length * ROW_H,
              }}
            />

            {plots.map((p) => (
              <a
                key={p.id}
                href={`/sites/${data.id}/plots/${p.id}`}
                className="flex border-b last:border-b-0 hover:bg-slate-50/50"
                style={{ height: ROW_H }}
              >
                {/* Sticky-ish label */}
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-white px-2 text-[11px]"
                  style={{ width: LABEL_W }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {p.plotNumber ? `P${p.plotNumber}` : p.name}
                    </p>
                    {p.houseType && (
                      <p className="truncate text-[9px] text-slate-500">
                        {p.houseType}
                      </p>
                    )}
                  </div>
                </div>

                {/* Week cells */}
                {weeks.map((w, i) => {
                  const weekEnd = addDays(w, 6);
                  const status = dominantWeekStatus(p.jobs, w, weekEnd);
                  return (
                    <div
                      key={i}
                      className={`shrink-0 border-r ${STATUS_BG[status]}`}
                      style={{ width: CELL_W }}
                      title={`${format(w, "d MMM")} – ${format(weekEnd, "d MMM")}`}
                    />
                  );
                })}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 border-t bg-slate-50 px-3 py-1.5 text-[9px] text-slate-600">
        <span className="font-semibold uppercase tracking-wider text-slate-500">
          Key
        </span>
        <Swatch className="bg-blue-400" label="Live" />
        <Swatch className="bg-amber-300" label="On hold" />
        <Swatch className="bg-emerald-400" label="Done" />
        <Swatch className="bg-slate-200" label="Upcoming" />
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="h-2.5 w-px bg-red-400" />
          Today
        </span>
      </div>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
