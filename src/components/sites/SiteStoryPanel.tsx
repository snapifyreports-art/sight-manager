"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  BookOpen,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Hammer,
  CloudRain,
  Wrench,
  AlertCircle,
  Quote as QuoteIcon,
  ChevronDown,
  ChevronRight,
  HardHat,
  Package,
} from "lucide-react";
import { format } from "date-fns";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";

/**
 * Site Story tab — internal retrospective view ("warts and all").
 * Builds continuously as the site runs. Reads from
 * `/api/sites/[id]/story?detail=full` and renders:
 *   - Header: site dates + completion %
 *   - Milestone strip (site created → first plot complete → halfway → close)
 *   - Variance summary panel (delay days, weather vs other, top reasons)
 *   - Per-plot expandable cards with timeline + counts
 *   - Contractor leaderboard
 *   - Quote board (best journal entries)
 *
 * No new data — this is pure synthesis of what's already in the DB.
 */

interface StoryData {
  site: {
    id: string;
    name: string;
    location: string | null;
    address: string | null;
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  overview: {
    plotCount: number;
    plotsCompleted: number;
    plotsInProgress: number;
    plotsNotStarted: number;
    overallPercent: number;
    daysElapsed: number;
    daysOriginalPlan: number | null;
    daysVarianceWorking: number | null;
  };
  milestones: Array<{ key: string; label: string; date: string | null }>;
  variance: {
    totalDelayDaysWeather: number;
    totalDelayDaysOther: number;
    totalRainDays: number;
    totalTemperatureDays: number;
    delayReasonBreakdown: { reason: string; count: number }[];
    onTimePlotCompletionRate: number;
    snagsRaised: number;
    snagsResolved: number;
    snagsOpen: number;
    // (#174) Full snag breakdown for the in-tab summary.
    snagsByPriority: { HIGH: number; MEDIUM: number; LOW: number };
    snagsByLocation: { location: string; count: number }[];
    snagsByContractor: Array<{
      contactId: string;
      name: string;
      company: string | null;
      count: number;
      openCount: number;
      resolvedCount: number;
    }>;
    snagMedianResolveDays: number | null;
    recentSnags: Array<{
      id: string;
      description: string;
      status: string;
      priority: string;
      location: string | null;
      plotNumber: string | null;
      raisedAt: string;
      resolvedAt: string | null;
    }>;
  };
  plotStories: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    houseType: string | null;
    status: "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
    buildCompletePercent: number;
    startedAt: string | null;
    completedAt: string | null;
    daysVarianceWorking: number | null;
    delayCount: number;
    snagCount: number;
    snagsOpen: number;
    photoCount: number;
    journalEntryCount: number;
    highlights: Array<{
      date: string;
      type: string;
      description: string;
      reason?: string;
    }>;
  }>;
  contractorPerformance: Array<{
    contactId: string;
    name: string;
    company: string | null;
    jobsAssigned: number;
    jobsCompleted: number;
    jobsOnTime: number;
    jobsLate: number;
    totalDelayDaysAttributed: number;
  }>;
  quoteBoard: Array<{
    source: string;
    date: string;
    plotNumber: string | null;
    body: string;
    authorName?: string;
  }>;
  // (May 2026 Keith request) Materials side of the build story.
  orders: {
    totalOrders: number;
    delivered: number;
    outstanding: number;
    sentLate: number;
    deliveredLate: number;
    topSuppliers: Array<{ name: string; orderCount: number }>;
  };
}

const REASON_LABELS: Record<string, { label: string; emoji: string }> = {
  WEATHER_RAIN: { label: "Rain", emoji: "☔" },
  WEATHER_TEMPERATURE: { label: "Temperature", emoji: "🌡️" },
  OTHER: { label: "Other", emoji: "⏳" },
};

export function SiteStoryPanel({ siteId }: { siteId: string }) {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/story?detail=full`, {
      cache: "no-store",
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${siteId}/story?detail=full`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const variance = data.overview.daysVarianceWorking;
  const varianceColor =
    variance == null
      ? "text-slate-500"
      : variance > 0
        ? "text-amber-700"
        : variance < 0
          ? "text-emerald-700"
          : "text-slate-700";
  const varianceIcon =
    variance == null
      ? Clock
      : variance > 0
        ? TrendingUp
        : variance < 0
          ? TrendingDown
          : Clock;
  const VarianceIcon = varianceIcon;

  return (
    <div className="space-y-6">
      {/* ─── Header ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Site Story</h2>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
            warts and all
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          What actually happened on this site — assembled live from every
          event, photo, journal, snag and delay. This is the internal
          retrospective; the Handover ZIP packages the cleaned-up version.
        </p>
      </div>

      {/* ─── Overview cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Plots"
          value={`${data.overview.plotsCompleted} / ${data.overview.plotCount}`}
          sub={`${Math.round(data.overview.overallPercent)}% complete`}
          icon={CheckCircle2}
          accent="emerald"
        />
        <StatCard
          label="Days elapsed"
          value={String(data.overview.daysElapsed)}
          sub={
            data.overview.daysOriginalPlan != null
              ? `vs ${data.overview.daysOriginalPlan} planned`
              : "no plan baseline"
          }
          icon={Clock}
          accent="blue"
        />
        <StatCard
          label="Variance"
          value={
            variance == null
              ? "—"
              : variance === 0
                ? "On plan"
                : `${variance > 0 ? "+" : ""}${variance}d`
          }
          sub={
            variance == null
              ? ""
              : variance > 0
                ? "behind plan"
                : variance < 0
                  ? "ahead of plan"
                  : ""
          }
          icon={VarianceIcon}
          accent={
            variance == null
              ? "slate"
              : variance > 0
                ? "amber"
                : variance < 0
                  ? "emerald"
                  : "slate"
          }
        />
        <StatCard
          label="Snags"
          value={String(data.variance.snagsRaised)}
          sub={
            data.variance.snagsOpen > 0
              ? `${data.variance.snagsOpen} still open`
              : "all resolved"
          }
          icon={Wrench}
          accent={data.variance.snagsOpen > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* ─── Milestone strip ──────────────────────────────── */}
      <section className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Key milestones</h3>
        <ol className="space-y-2">
          {data.milestones.map((m) => (
            <li key={m.key} className="flex items-center gap-3 text-sm">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  m.date
                    ? "bg-blue-100 text-blue-700"
                    : "border border-slate-200 bg-slate-50 text-slate-300"
                }`}
              >
                {m.date ? <CheckCircle2 className="size-4" /> : "·"}
              </span>
              <span className={m.date ? "font-medium text-slate-800" : "text-slate-400"}>
                {m.label}
              </span>
              <span className="ml-auto text-xs text-slate-500">
                {m.date ? format(new Date(m.date), "dd MMM yyyy") : "not yet"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── Variance breakdown ───────────────────────────── */}
      <section className="rounded-xl border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Variance breakdown
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SmallStat
            label="Weather days"
            value={String(
              data.variance.totalRainDays + data.variance.totalTemperatureDays,
            )}
            sub={`${data.variance.totalRainDays} rain · ${data.variance.totalTemperatureDays} temp`}
            icon={CloudRain}
          />
          <SmallStat
            label="Weather delays"
            value={`${data.variance.totalDelayDaysWeather}d`}
            sub="excused"
            icon={CloudRain}
          />
          <SmallStat
            label="Other delays"
            value={`${data.variance.totalDelayDaysOther}d`}
            sub="non-weather"
            icon={AlertCircle}
          />
          <SmallStat
            label="On-time plots"
            value={`${Math.round(data.variance.onTimePlotCompletionRate * 100)}%`}
            sub={`of ${data.overview.plotsCompleted} completed`}
            icon={TrendingUp}
          />
        </div>

        {data.variance.delayReasonBreakdown.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Delay reasons
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.variance.delayReasonBreakdown.slice(0, 8).map((r) => {
                const meta = REASON_LABELS[r.reason] ?? {
                  label: r.reason,
                  emoji: "⏳",
                };
                return (
                  <span
                    key={r.reason}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                  >
                    <span>{meta.emoji}</span>
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-slate-500">×{r.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ─── Snag summary ─────────────────────────────────── */}
      {/* (#174) Full snag picture — priority mix, hot locations, the
          contractors most often on the receiving end, median resolve
          time, and the latest 10. So the Story tells the actual
          quality story, not just a single aggregate count. */}
      {data.variance.snagsRaised > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="size-4 text-amber-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-700">
              Snag summary
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Raised total
              </p>
              <p className="mt-0.5 text-2xl font-bold text-slate-800">
                {data.variance.snagsRaised}
              </p>
              <p className="text-[11px] text-slate-500">
                {data.variance.snagsResolved} resolved · {data.variance.snagsOpen} open
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Priority mix
              </p>
              <div className="mt-1 flex items-baseline gap-2 text-xs">
                <span className="font-medium text-red-700">
                  {data.variance.snagsByPriority.HIGH} high
                </span>
                <span className="font-medium text-amber-700">
                  {data.variance.snagsByPriority.MEDIUM} med
                </span>
                <span className="font-medium text-slate-600">
                  {data.variance.snagsByPriority.LOW} low
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Median resolve
              </p>
              <p className="mt-0.5 text-2xl font-bold text-emerald-800">
                {data.variance.snagMedianResolveDays != null
                  ? `${data.variance.snagMedianResolveDays}d`
                  : "—"}
              </p>
              <p className="text-[11px] text-emerald-700/80">
                across resolved snags
              </p>
            </div>
          </div>

          {data.variance.snagsByLocation.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Hot locations
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.variance.snagsByLocation.map((l) => (
                  <span
                    key={l.location}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">{l.location}</span>
                    <span className="text-slate-500">×{l.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.variance.snagsByContractor.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Snags by contractor
              </p>
              <div className="space-y-1.5">
                {data.variance.snagsByContractor.map((c) => (
                  <div
                    key={c.contactId}
                    className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5 text-xs"
                  >
                    <span className="truncate font-medium text-slate-700">
                      {c.company || c.name}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {c.count}
                      </span>{" "}
                      total · {c.openCount} open · {c.resolvedCount} resolved
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.variance.recentSnags.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Most recent
              </p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
                {data.variance.recentSnags.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-slate-700">
                        <span className="font-medium text-slate-900">
                          {s.plotNumber ? `Plot ${s.plotNumber}` : "Site"}
                        </span>
                        {s.location ? ` · ${s.location}` : ""}
                        {" — "}
                        {s.description}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        s.status === "RESOLVED" || s.status === "CLOSED"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.priority === "HIGH"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {s.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ─── Materials & orders ───────────────────────────── */}
      {/* (May 2026 Keith request) The materials side of the build —
          what was ordered, what arrived, how it performed. */}
      {data.orders.totalOrders > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Package className="size-4 text-blue-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-700">
              Materials &amp; orders
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Orders total
              </p>
              <p className="mt-0.5 text-2xl font-bold text-slate-800">
                {data.orders.totalOrders}
              </p>
              <p className="text-[11px] text-slate-500">
                {data.orders.delivered} delivered · {data.orders.outstanding}{" "}
                outstanding
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Sent late
              </p>
              <p className="mt-0.5 text-2xl font-bold text-amber-800">
                {data.orders.sentLate}
              </p>
              <p className="text-[11px] text-amber-700">
                orders went out after their planned date
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">
                Delivered late
              </p>
              <p className="mt-0.5 text-2xl font-bold text-red-800">
                {data.orders.deliveredLate}
              </p>
              <p className="text-[11px] text-red-700">
                arrived after the promised date
              </p>
            </div>
          </div>

          {data.orders.topSuppliers.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Busiest suppliers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.orders.topSuppliers.map((s) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-slate-500">·{s.orderCount}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* (#191) Lateness section — every open/resolved event for
          this site with reason breakdown + attribution. The full
          retrospective lives here.
          (May 2026 audit SM-P1) defaultExpanded — the Story tab is
          a single long retrospective scroll; making the user click
          to expand again here was friction. */}
      <section className="rounded-xl border bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="size-4 text-amber-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-700">Lateness</h3>
        </div>
        <LatenessSummary siteId={siteId} status="all" defaultExpanded />
      </section>

      {/* ─── Per-plot stories ─────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Per-plot stories
        </h3>
        <div className="space-y-2">
          {data.plotStories.map((p) => {
            const expanded = expandedPlot === p.id;
            return (
              <div
                key={p.id}
                className="overflow-hidden rounded-xl border bg-white"
              >
                <button
                  type="button"
                  onClick={() => setExpandedPlot(expanded ? null : p.id)}
                  // (May 2026 a11y audit #123) aria-expanded so screen
                  // readers announce the open/closed state of the
                  // plot card. Chevron is decorative, mirrors the state.
                  aria-expanded={expanded}
                  aria-label={`Plot ${p.plotNumber || ""} story — ${expanded ? "collapse" : "expand"}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  {expanded ? (
                    <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-900">
                        Plot {p.plotNumber || "—"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {p.houseType || "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>
                        <strong className="text-slate-700">
                          {Math.round(p.buildCompletePercent)}%
                        </strong>{" "}
                        complete
                      </span>
                      {p.delayCount > 0 && (
                        <span>{p.delayCount} delays</span>
                      )}
                      {p.snagCount > 0 && (
                        <span>
                          {p.snagCount} snags
                          {p.snagsOpen > 0 && ` (${p.snagsOpen} open)`}
                        </span>
                      )}
                      {p.photoCount > 0 && <span>{p.photoCount} photos</span>}
                      {p.journalEntryCount > 0 && (
                        <span>{p.journalEntryCount} updates</span>
                      )}
                    </div>
                  </div>
                  <PlotStatusPill status={p.status} />
                  {p.daysVarianceWorking != null && p.daysVarianceWorking !== 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.daysVarianceWorking > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {p.daysVarianceWorking > 0 ? "+" : ""}
                      {p.daysVarianceWorking}d
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="border-t bg-slate-50/50 px-4 py-3">
                    {p.highlights.length === 0 ? (
                      <p className="text-xs italic text-slate-400">
                        No timeline events recorded for this plot yet.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {p.highlights.slice(-25).reverse().map((h, idx) => (
                          <HighlightRow key={`${p.id}-${idx}`} highlight={h} />
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Contractor leaderboard ───────────────────────── */}
      {data.contractorPerformance.length > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <HardHat className="size-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700">
              Contractor leaderboard
            </h3>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Contractor</th>
                  <th className="px-3 py-2 text-center">Assigned</th>
                  <th className="px-3 py-2 text-center">Done</th>
                  <th className="px-3 py-2 text-center">On time</th>
                  <th className="px-3 py-2 text-center">Late</th>
                  <th className="px-3 py-2 text-right">Days late</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.contractorPerformance.slice(0, 12).map((c) => (
                  <tr key={c.contactId} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.company && (
                        <div className="text-xs text-slate-500">{c.company}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{c.jobsAssigned}</td>
                    <td className="px-3 py-2 text-center">{c.jobsCompleted}</td>
                    <td className="px-3 py-2 text-center text-emerald-700">
                      {c.jobsOnTime}
                    </td>
                    <td className="px-3 py-2 text-center text-amber-700">
                      {c.jobsLate}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.totalDelayDaysAttributed > 0
                        ? `${c.totalDelayDaysAttributed}d`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Quote board ──────────────────────────────────── */}
      {data.quoteBoard.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <QuoteIcon className="size-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700">
              Quote board
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.quoteBoard.slice(0, 6).map((q, idx) => (
              <article
                key={idx}
                className="rounded-xl border bg-white p-4 shadow-sm"
              >
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  &ldquo;{q.body.length > 280 ? `${q.body.slice(0, 280)}…` : q.body}&rdquo;
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {q.authorName ?? "—"} · Plot {q.plotNumber ?? "—"} ·{" "}
                  {format(new Date(q.date), "dd MMM")}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: "blue" | "emerald" | "amber" | "slate";
}) {
  const ring = {
    blue: "border-blue-200 bg-blue-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    slate: "border-slate-200 bg-slate-50/50",
  }[accent];
  const iconColor = {
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-500",
  }[accent];

  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${iconColor}`} />
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SmallStat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function PlotStatusPill({ status }: { status: string }) {
  const meta = {
    NOT_STARTED: { label: "Not started", color: "bg-slate-100 text-slate-600" },
    IN_PROGRESS: { label: "In progress", color: "bg-blue-100 text-blue-700" },
    ON_HOLD: { label: "On hold", color: "bg-amber-100 text-amber-700" },
    COMPLETED: { label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  }[status] ?? { label: status, color: "bg-slate-100 text-slate-600" };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}

function HighlightRow({
  highlight,
}: {
  highlight: { date: string; type: string; description: string; reason?: string };
}) {
  const Icon =
    highlight.type === "JOB_STARTED"
      ? Hammer
      : highlight.type === "JOB_COMPLETED" || highlight.type === "JOB_SIGNED_OFF"
        ? CheckCircle2
        : highlight.type === "DELAY"
          ? Clock
          : highlight.type === "JOURNAL"
            ? QuoteIcon
            : highlight.type === "SNAG"
              ? Wrench
              : Clock;
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-slate-700">{highlight.description}</p>
        <p className="text-[10px] text-slate-400">
          {format(new Date(highlight.date), "dd MMM yyyy")}
          {highlight.reason && ` · ${highlight.reason}`}
        </p>
      </div>
    </li>
  );
}
