"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Hammer,
  CheckCircle2,
  Circle,
  PauseCircle,
  Clock,
  Loader2,
  ChevronRight,
  Calendar,
  LayoutGrid,
  BarChart3,
} from "lucide-react";
import { getCurrentDateAtMidnight } from "@/lib/dev-date";
import { MobileProgrammeGantt } from "@/components/programme/MobileProgrammeGantt";

/**
 * (May 2026 mobile programme rebuild) Mobile-first vertical list view
 * of a site's programme.
 *
 * The desktop SiteProgramme is a horizontal Gantt that can't survive
 * a phone viewport. This component takes the same /programme API
 * response but renders one plot card per row, each with:
 *
 *   - Plot label + house type
 *   - Status pill (overall)
 *   - Build % progress bar
 *   - Current stage (icon + name)
 *   - "Next milestone" line (next NOT_STARTED stage)
 *   - Tap-through chevron to /sites/[siteId]/plots/[plotId]
 *
 * Rendered alongside the desktop SiteProgramme via Tailwind responsive
 * classes — mobile-only by default; the desktop view is `hidden md:block`
 * and this is `md:hidden`.
 */

interface ProgrammeJob {
  id: string;
  name: string;
  status: string;
  parentId: string | null;
  parentStage: string | null;
  startDate: string | null;
  endDate: string | null;
  stageCode?: string | null;
  sortOrder?: number;
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

const STATUS_META: Record<
  string,
  { label: string; pill: string; icon: typeof Circle }
> = {
  COMPLETED: { label: "Complete", pill: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  IN_PROGRESS: { label: "Live", pill: "bg-blue-100 text-blue-700", icon: Hammer },
  ON_HOLD: { label: "On hold", pill: "bg-amber-100 text-amber-700", icon: PauseCircle },
  NOT_STARTED: { label: "Upcoming", pill: "bg-slate-100 text-slate-600", icon: Circle },
};

function aggregateStatus(jobs: ProgrammeJob[]): string {
  if (jobs.length === 0) return "NOT_STARTED";
  if (jobs.every((j) => j.status === "COMPLETED")) return "COMPLETED";
  if (jobs.some((j) => j.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (jobs.some((j) => j.status === "ON_HOLD")) return "ON_HOLD";
  return "NOT_STARTED";
}

// Treat parents as "stages" and pick the most representative one.
// Live → first IN_PROGRESS stage; otherwise → first NOT_STARTED;
// otherwise → "Complete" sentinel.
function pickCurrentAndNextStage(jobs: ProgrammeJob[]): {
  current: { name: string; status: string } | null;
  nextMilestone: { name: string; startDate: string | null } | null;
} {
  const stageOrder = new Map<string, ProgrammeJob[]>();
  for (const j of jobs) {
    const key = j.parentStage || j.name;
    const cur = stageOrder.get(key) ?? [];
    cur.push(j);
    stageOrder.set(key, cur);
  }
  const stages = Array.from(stageOrder.entries())
    .map(([name, children]) => {
      const earliest = children
        .map((c) => c.startDate)
        .filter(Boolean)
        .sort()[0] || null;
      return {
        name,
        status: aggregateStatus(children),
        startDate: earliest,
      };
    })
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const current =
    stages.find((s) => s.status === "IN_PROGRESS") ||
    stages.find((s) => s.status === "ON_HOLD") ||
    null;
  const next = stages.find(
    (s) => s.status === "NOT_STARTED" && s !== current,
  );
  return {
    current,
    nextMilestone: next ? { name: next.name, startDate: next.startDate } : null,
  };
}

export function MobileProgramme({ siteId }: { siteId: string }) {
  const [data, setData] = useState<ProgrammeSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "upcoming" | "complete">("all");
  // (#178) Mobile view toggle — "gantt" is the new compact week-strip
  // Gantt (Keith's "where's the Gantt gone" answer), "cards" is the
  // existing card list. Default to Gantt because that's what people
  // expect from the Programme tab. Persisted to localStorage.
  const [view, setView] = useState<"gantt" | "cards">(() => {
    if (typeof window === "undefined") return "gantt";
    try {
      const stored = localStorage.getItem("sight-manager-mobile-programme-view");
      return stored === "cards" ? "cards" : "gantt";
    } catch {
      return "gantt";
    }
  });
  function setViewPersisted(v: "gantt" | "cards") {
    setView(v);
    try {
      localStorage.setItem("sight-manager-mobile-programme-view", v);
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/programme`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const today = getCurrentDateAtMidnight();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading programme…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
        Couldn&apos;t load the programme. Pull down to refresh.
      </div>
    );
  }

  const plotsToShow = data.plots
    .map((p) => ({
      ...p,
      status: aggregateStatus(p.jobs),
      stage: pickCurrentAndNextStage(p.jobs),
    }))
    .filter((p) => {
      if (filter === "all") return true;
      if (filter === "live") return p.status === "IN_PROGRESS";
      if (filter === "upcoming") return p.status === "NOT_STARTED";
      if (filter === "complete") return p.status === "COMPLETED";
      return true;
    })
    .sort((a, b) => {
      // Live first, then plot number / name
      const rank = (s: string) =>
        s === "IN_PROGRESS" ? 0 : s === "ON_HOLD" ? 1 : s === "NOT_STARTED" ? 2 : 3;
      const rDiff = rank(a.status) - rank(b.status);
      if (rDiff !== 0) return rDiff;
      const aLabel = a.plotNumber || a.name;
      const bLabel = b.plotNumber || b.name;
      return aLabel.localeCompare(bLabel, undefined, { numeric: true });
    });

  return (
    <div className="space-y-3">
      {/* (#178) View toggle — Gantt vs Cards. Gantt is the default. */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setViewPersisted("gantt")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
              view === "gantt"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <BarChart3 className="size-3" aria-hidden /> Gantt
          </button>
          <button
            onClick={() => setViewPersisted("cards")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition ${
              view === "cards"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <LayoutGrid className="size-3" aria-hidden /> Cards
          </button>
        </div>
        {view === "cards" && (
          <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
            {(["all", "live", "upcoming", "complete"] as const).map((f) => {
              const label =
                f === "all"
                  ? "All"
                  : f === "live"
                    ? "Live"
                    : f === "upcoming"
                      ? "Upcoming"
                      : "Complete";
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    filter === f
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* (#178) Gantt view — week strip across all plots. */}
      {view === "gantt" && <MobileProgrammeGantt data={data} />}

      {view === "cards" && plotsToShow.length === 0 && (
        <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
          No plots match this filter.
        </div>
      )}

      {/* (#178) Plot cards — only when card view is selected. */}
      {view === "cards" && (
      <ul className="space-y-2">
        {plotsToShow.map((p) => {
          const meta = STATUS_META[p.status] ?? STATUS_META.NOT_STARTED;
          const Icon = meta.icon;
          const pct = Math.round(p.buildCompletePercent ?? 0);
          return (
            <li key={p.id}>
              <Link
                href={`/sites/${siteId}/plots/${p.id}`}
                className="block rounded-lg border bg-white p-3 active:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${meta.pill.replace("text-", "text-")}`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-medium text-slate-900">
                        {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                        {p.houseType && (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            · {p.houseType}
                          </span>
                        )}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.pill}`}>
                        {meta.label}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="flex items-baseline justify-between text-[10px] text-slate-500">
                        <span>{pct}% complete</span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {/* Current + next */}
                    <div className="mt-2 space-y-0.5 text-xs">
                      {p.stage.current && (
                        <p className="flex items-center gap-1 text-blue-700">
                          <Hammer className="size-3" aria-hidden />
                          Now: {p.stage.current.name}
                        </p>
                      )}
                      {p.stage.nextMilestone && (
                        <p className="flex items-center gap-1 text-slate-500">
                          <Calendar className="size-3" aria-hidden />
                          Next: {p.stage.nextMilestone.name}
                          {p.stage.nextMilestone.startDate && (
                            <span className="text-slate-400">
                              · {format(parseISO(p.stage.nextMilestone.startDate), "d MMM")}
                            </span>
                          )}
                        </p>
                      )}
                      {!p.stage.current && !p.stage.nextMilestone && (
                        <p className="flex items-center gap-1 text-slate-500">
                          <Clock className="size-3" aria-hidden />
                          {p.status === "COMPLETED"
                            ? "All stages complete"
                            : "No scheduled stages"}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      )}
      <p className="text-center text-[10px] text-muted-foreground">
        {view === "gantt"
          ? `${data.plots.length} plot${data.plots.length === 1 ? "" : "s"} · scroll the strip horizontally · today highlighted`
          : `Plot list for ${format(today, "EEEE d MMM")}. Tap a row to open the plot.`}
      </p>
    </div>
  );
}
