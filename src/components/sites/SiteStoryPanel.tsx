"use client";

import Link from "next/link";
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
  Camera,
  Flag,
  ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";
import { Button } from "@/components/ui/button";
import { fetchErrorMessage } from "@/components/ui/toast";
import { latenessReasonLabel } from "@/lib/labels";

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
    delayReasonBreakdown: { reason: string; count: number; daysLate: number }[];
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
    ncrCount?: number;
    ncrOpenCount?: number;
    defectCount?: number;
    defectOpenCount?: number;
    variationCount?: number;
    variationApprovedCount?: number;
    preStartTotal?: number;
    preStartChecked?: number;
    voiceNoteCount?: number;
    photoAnnotationCount?: number;
    inspectionTotal?: number;
    inspectionsPassed?: number;
    inspectionsFailed?: number;
    inspectionsOpen?: number;
    inspectionsOverdue?: number;
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
  // (May 2026 Story-linkage audit) Compliance — NCRs, DefectReports,
  // Variations rolled up here so the Story narrative includes the QA
  // / warranty / scope-change side of the build.
  compliance: {
    ncrs: {
      total: number;
      open: number;
      closed: number;
      recent: Array<{
        id: string;
        ref: string | null;
        title: string;
        status: string;
        raisedAt: string;
        closedAt: string | null;
      }>;
    };
    defects: {
      total: number;
      open: number;
      resolved: number;
      recent: Array<{
        id: string;
        ref: string | null;
        title: string;
        status: string;
        reportedAt: string;
        resolvedAt: string | null;
      }>;
    };
    variations: {
      total: number;
      approved: number;
      costDelta: number;
      daysDelta: number;
      recent: Array<{
        id: string;
        ref: string | null;
        title: string;
        status: string;
        costDelta: number | null;
        daysDelta: number | null;
      }>;
    };
    // (Jun 2026 Wave-4 D10) Compliance documents — insurance/permits/certs.
    documents?: {
      total: number;
      active: number;
      expired: number;
      expiringSoon: number;
      recent: Array<{
        id: string;
        name: string;
        category: string | null;
        status: string;
        expiresAt: string | null;
        expiringSoon: boolean;
      }>;
    };
  };
  evidence: {
    preStartChecks: { total: number; checked: number };
    voiceNotes: { total: number };
    photoAnnotations: { total: number };
  };
  handoverReadiness: {
    requiredTotal: number;
    requiredChecked: number;
  };
  inspections?: {
    total: number;
    passed: number;
    failed: number;
    open: number;
    overdue: number;
    recent: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      scheduledDate: string;
      plotNumber: string | null;
      resolvedAt: string | null;
    }>;
  };
  toolboxTalks: {
    total: number;
    requested: number;
    completed: number;
    cancelled: number;
    attachmentTotal: number;
    recent: Array<{
      id: string;
      topic: string;
      status: string;
      requestedAt: string;
      deliveredAt: string | null;
      dueBy: string | null;
      contractorCount: number;
      attachmentCount: number;
    }>;
  };
  overdueNow: {
    count: number;
    jobs: Array<{
      id: string;
      name: string;
      plotLabel: string;
      plotId: string;
      originalEndDate: string | null;
      daysOverdue: number;
    }>;
  };
}

// (Jun 2026 audit) Emoji accents for the three reasons that have one.
// Labels for the other 11 LatenessEvent.reasonCode values come from
// latenessReasonLabel (src/lib/labels.ts) — pre-fix the fallback was
// the raw enum, so chips read "MATERIAL_LATE ×3 · 5d" on the Story tab.
const REASON_LABELS: Record<string, { label: string; emoji: string }> = {
  WEATHER_RAIN: { label: "Rain", emoji: "☔" },
  WEATHER_TEMPERATURE: { label: "Temperature", emoji: "🌡️" },
  OTHER: { label: "Other", emoji: "⏳" },
};

export function SiteStoryPanel({ siteId }: { siteId: string }) {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  // (Jun 2026 audit) Pre-fix a failed story fetch left loading=false +
  // data=null — an infinite spinner with no message. Now an inline
  // error card with Retry (wired to `refresh`, previously dead code).
  const [error, setError] = useState<string | null>(null);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/story?detail=full`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(await fetchErrorMessage(res));
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/sites/${siteId}/story?detail=full`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(await fetchErrorMessage(r));
          return;
        }
        const d = await r.json();
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled)
          setError("Network error — check your connection and try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 py-12 text-center">
        <AlertCircle className="size-6 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-slate-800">
            Couldn&apos;t load the site story
          </p>
          {error && <p className="mt-0.5 text-xs text-slate-500">{error}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          Try again
        </Button>
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
                  label: latenessReasonLabel(r.reason),
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
                    {r.daysLate > 0 && (
                      <span className="text-slate-400">·</span>
                    )}
                    {r.daysLate > 0 && (
                      <span className="font-semibold text-slate-700">
                        {r.daysLate}d
                      </span>
                    )}
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

      {/* (May 2026 Story-linkage audit) Currently overdue —
          jobs past their ORIGINAL planned end and not COMPLETED.
          The Handover ZIP delay-report already had this; the Story
          tab was missing it entirely, so the live narrative didn't
          show what was actually stuck. Renders only when there ARE
          overdue jobs — no false positives on a healthy site. */}
      {data.overdueNow.count > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-semibold text-red-900">
              Currently overdue ({data.overdueNow.count})
            </h3>
            <span className="text-xs text-red-700">
              past original planned end · sorted by working days overdue
            </span>
          </div>
          <ul className="space-y-1">
            {data.overdueNow.jobs.slice(0, 10).map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-baseline gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm"
              >
                <Link
                  href={`/jobs/${j.id}`}
                  className="font-medium text-slate-900 hover:underline hover:text-red-700"
                >
                  {j.name}
                </Link>
                <span className="text-xs text-slate-600">{j.plotLabel}</span>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-800">
                  {j.daysOverdue}d late
                </span>
              </li>
            ))}
          </ul>
          {data.overdueNow.count > 10 && (
            <p className="mt-2 text-xs text-red-700">
              +{data.overdueNow.count - 10} more — see the Delay Report tab
              for the full list.
            </p>
          )}
        </section>
      )}

      {/* (May 2026 Story-linkage audit) Toolbox talks — request +
          completion lifecycle now reaches Story. */}
      {data.toolboxTalks.total > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">Toolbox talks</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Total
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {data.toolboxTalks.total}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Requested
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {data.toolboxTalks.requested}
              </p>
              <p className="text-xs text-amber-700">awaiting delivery</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Completed
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {data.toolboxTalks.completed}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Attachments
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {data.toolboxTalks.attachmentTotal}
              </p>
              <p className="text-xs text-slate-600">briefing docs</p>
            </div>
          </div>
          {data.toolboxTalks.recent.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </p>
              <ul className="space-y-1">
                {data.toolboxTalks.recent.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-baseline gap-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {t.topic}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        t.status === "REQUESTED"
                          ? "bg-amber-100 text-amber-800"
                          : t.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {t.status}
                    </span>
                    {t.contractorCount > 0 && (
                      <span className="text-xs text-slate-500">
                        {t.contractorCount} contractor
                        {t.contractorCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {t.attachmentCount > 0 && (
                      <span className="text-xs text-slate-500">
                        · {t.attachmentCount} attachment
                        {t.attachmentCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* (May 2026 Story-linkage audit) Handover readiness — sum of
          required HandoverChecklist items across the site and how
          many are signed off. Closure flow uses this to gate site
          closure; surfacing in Story gives early visibility. */}
      {data.handoverReadiness.requiredTotal > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-1 font-semibold text-slate-900">
            Handover readiness
          </h3>
          <p className="text-xs text-muted-foreground">
            Required handover documents signed off across every plot
            (EPC, gas-safe, electrical, NHBC, warranty etc.).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">
                  {data.handoverReadiness.requiredChecked} of{" "}
                  {data.handoverReadiness.requiredTotal} signed off
                </span>
                <span className="font-bold">
                  {Math.round(
                    (data.handoverReadiness.requiredChecked /
                      data.handoverReadiness.requiredTotal) *
                      100,
                  )}
                  %
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${(data.handoverReadiness.requiredChecked / data.handoverReadiness.requiredTotal) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* (Jun 2026 Inspections) Statutory + QA hold-point rollup —
          passed/open/failed across every plot, plus the most-recent
          results. Auto-hides when no inspections exist on the site. */}
      {data.inspections && data.inspections.total > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-1 font-semibold text-slate-900">Inspections</h3>
          <p className="text-xs text-muted-foreground">
            NHBC, Building Control, warranty and internal QA hold-points
            across the site. Open or failed inspections block a clean handover.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Total</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.inspections.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Passed</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{data.inspections.passed}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Open</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.inspections.open}</p>
              {data.inspections.overdue > 0 && (
                <p className="text-[11px] font-medium text-amber-600">{data.inspections.overdue} overdue</p>
              )}
            </div>
            <div className={`rounded-lg border p-3 ${data.inspections.failed > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${data.inspections.failed > 0 ? "text-red-700" : "text-slate-600"}`}>Failed</p>
              <p className={`mt-1 text-2xl font-bold ${data.inspections.failed > 0 ? "text-red-700" : "text-slate-900"}`}>{data.inspections.failed}</p>
            </div>
          </div>
          {data.inspections.recent.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.inspections.recent.slice(0, 6).map((ins) => (
                <li key={ins.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-slate-700">
                    {ins.plotNumber ? `Plot ${ins.plotNumber} — ` : ""}{ins.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      ins.status === "PASSED"
                        ? "bg-emerald-100 text-emerald-700"
                        : ins.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : ins.status === "OVERDUE"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ins.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* (May 2026 Story-linkage audit) Evidence & readiness —
          PreStartCheck completion ratio + voice-note count + photo-
          annotation count. Surfaces only when there's something to
          show, same auto-hide rule as Compliance below. */}
      {(data.evidence.preStartChecks.total > 0 ||
        data.evidence.voiceNotes.total > 0 ||
        data.evidence.photoAnnotations.total > 0) && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">
            Evidence &amp; readiness
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.evidence.preStartChecks.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Pre-start checks
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.evidence.preStartChecks.checked}
                  <span className="text-base font-normal text-slate-500">
                    {" / "}
                    {data.evidence.preStartChecks.total}
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  {data.evidence.preStartChecks.checked ===
                  data.evidence.preStartChecks.total
                    ? "all checked"
                    : `${data.evidence.preStartChecks.total - data.evidence.preStartChecks.checked} outstanding`}
                </p>
              </div>
            )}
            {data.evidence.voiceNotes.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Voice notes
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.evidence.voiceNotes.total}
                </p>
                <p className="text-xs text-slate-600">
                  recorded against jobs &amp; snags
                </p>
              </div>
            )}
            {data.evidence.photoAnnotations.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Photo annotations
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.evidence.photoAnnotations.total}
                </p>
                <p className="text-xs text-slate-600">marked up on photos</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* (May 2026 Story-linkage audit) Compliance — NCRs +
          DefectReports + Variations. Renders only when there's
          something to show so a clean site doesn't grow noise. */}
      {(data.compliance.ncrs.total > 0 ||
        data.compliance.defects.total > 0 ||
        data.compliance.variations.total > 0 ||
        (data.compliance.documents?.total ?? 0) > 0) && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 font-semibold text-slate-900">Compliance</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.compliance.ncrs.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  NCRs
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.compliance.ncrs.total}
                </p>
                <p className="text-xs text-slate-600">
                  {data.compliance.ncrs.open > 0 ? (
                    <span className="text-amber-700">
                      {data.compliance.ncrs.open} open
                    </span>
                  ) : (
                    <span className="text-emerald-700">all closed</span>
                  )}
                </p>
                {data.compliance.ncrs.recent.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {data.compliance.ncrs.recent.slice(0, 3).map((n) => (
                      <li key={n.id} className="truncate text-slate-700">
                        {n.ref ? `${n.ref} · ` : ""}
                        {n.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {data.compliance.defects.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Defects
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.compliance.defects.total}
                </p>
                <p className="text-xs text-slate-600">
                  {data.compliance.defects.open > 0 ? (
                    <span className="text-amber-700">
                      {data.compliance.defects.open} open
                    </span>
                  ) : (
                    <span className="text-emerald-700">
                      all resolved
                    </span>
                  )}
                </p>
                {data.compliance.defects.recent.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {data.compliance.defects.recent.slice(0, 3).map((d) => (
                      <li key={d.id} className="truncate text-slate-700">
                        {d.ref ? `${d.ref} · ` : ""}
                        {d.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {data.compliance.variations.total > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Variations
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.compliance.variations.total}
                </p>
                <p className="text-xs text-slate-600">
                  {data.compliance.variations.approved} approved
                  {data.compliance.variations.costDelta !== 0 && (
                    <>
                      {" · £"}
                      {Math.round(data.compliance.variations.costDelta).toLocaleString()}
                    </>
                  )}
                  {data.compliance.variations.daysDelta !== 0 && (
                    <>
                      {" · "}
                      {data.compliance.variations.daysDelta > 0 ? "+" : ""}
                      {data.compliance.variations.daysDelta}d
                    </>
                  )}
                </p>
                {data.compliance.variations.recent.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {data.compliance.variations.recent.slice(0, 3).map((v) => (
                      <li key={v.id} className="truncate text-slate-700">
                        {v.ref ? `${v.ref} · ` : ""}
                        {v.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {/* (Jun 2026 Wave-4 D10) Compliance documents — insurance,
                permits, CDM, certs. Expired is a closure blocker; within
                14 days of expiry is a warning. */}
            {data.compliance.documents &&
              data.compliance.documents.total > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Compliance Docs
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {data.compliance.documents.total}
                  </p>
                  <p className="text-xs text-slate-600">
                    {data.compliance.documents.expired > 0 ? (
                      <span className="text-red-700">
                        {data.compliance.documents.expired} expired
                      </span>
                    ) : data.compliance.documents.expiringSoon > 0 ? (
                      <span className="text-amber-700">
                        {data.compliance.documents.expiringSoon} expiring soon
                      </span>
                    ) : (
                      <span className="text-emerald-700">all in date</span>
                    )}
                  </p>
                  {data.compliance.documents.recent.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {data.compliance.documents.recent.slice(0, 3).map((d) => (
                        <li key={d.id} className="truncate text-slate-700">
                          {d.name}
                          {d.status === "EXPIRED" ? (
                            <span className="text-red-700"> · expired</span>
                          ) : d.expiringSoon ? (
                            <span className="text-amber-700"> · expiring</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
          </div>
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
                      {(p.inspectionTotal ?? 0) > 0 && (
                        <span
                          className={
                            (p.inspectionsFailed ?? 0) > 0
                              ? "font-medium text-red-600"
                              : (p.inspectionsOverdue ?? 0) > 0
                                ? "font-medium text-amber-600"
                                : undefined
                          }
                        >
                          {p.inspectionsPassed ?? 0}/{p.inspectionTotal} inspections
                          {(p.inspectionsFailed ?? 0) > 0 && ` · ${p.inspectionsFailed} failed`}
                          {(p.inspectionsOverdue ?? 0) > 0 && ` · ${p.inspectionsOverdue} overdue`}
                        </span>
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
                {/* (May 2026 Keith audit) Sort active contractors (any
                    jobs completed) to the top so the eye lands on rows
                    with actual signal. Contractors with assignments but
                    no completions yet render a single muted "Hasn't
                    started yet" cell instead of five "0 / 0 / 0 / —"
                    columns — they're still listed (so a manager can see
                    who's queued up) but don't pull attention. */}
                {[...data.contractorPerformance]
                  .sort((a, b) => {
                    const aActive = a.jobsCompleted > 0 ? 1 : 0;
                    const bActive = b.jobsCompleted > 0 ? 1 : 0;
                    if (aActive !== bActive) return bActive - aActive;
                    return b.jobsAssigned - a.jobsAssigned;
                  })
                  .slice(0, 12)
                  .map((c) => {
                    const notStarted = c.jobsCompleted === 0;
                    return (
                      <tr
                        key={c.contactId}
                        className={
                          notStarted
                            ? "text-slate-400 hover:bg-slate-50/50"
                            : "hover:bg-slate-50/50"
                        }
                      >
                        <td className="px-3 py-2">
                          <div
                            className={
                              notStarted
                                ? "font-medium text-slate-500"
                                : "font-medium text-slate-900"
                            }
                          >
                            {c.name}
                          </div>
                          {c.company && (
                            <div className="text-xs text-slate-400">
                              {c.company}
                            </div>
                          )}
                        </td>
                        {notStarted ? (
                          <td colSpan={5} className="px-3 py-2 text-xs italic">
                            Hasn&rsquo;t started yet · {c.jobsAssigned} job
                            {c.jobsAssigned === 1 ? "" : "s"} assigned
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-center">
                              {c.jobsAssigned}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.jobsCompleted}
                            </td>
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
                          </>
                        )}
                      </tr>
                    );
                  })}
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
  // (May 2026 Story-completeness pass) Widened from 6 to 11 types —
  // orders, lateness, weather and plot/handover milestones now appear
  // in plot timelines, each with its own icon + tint.
  const STYLE: Record<string, { Icon: typeof Hammer; color: string }> = {
    JOB_STARTED: { Icon: Hammer, color: "text-blue-500" },
    JOB_COMPLETED: { Icon: CheckCircle2, color: "text-emerald-500" },
    JOB_SIGNED_OFF: { Icon: CheckCircle2, color: "text-emerald-500" },
    DELAY: { Icon: Clock, color: "text-amber-500" },
    JOURNAL: { Icon: QuoteIcon, color: "text-slate-400" },
    SNAG: { Icon: Wrench, color: "text-red-500" },
    PHOTO: { Icon: Camera, color: "text-slate-500" },
    ORDER: { Icon: Package, color: "text-indigo-500" },
    LATENESS: { Icon: AlertCircle, color: "text-amber-600" },
    WEATHER: { Icon: CloudRain, color: "text-sky-500" },
    MILESTONE: { Icon: Flag, color: "text-emerald-600" },
    // (Jun 2026 audit fix) Inspection pass/fail had no icon → fell back to
    // a grey clock, indistinguishable from a delay. Green when it reads
    // "passed", red when "failed".
    INSPECTION: {
      Icon: ClipboardCheck,
      color: /fail/i.test(highlight.description) ? "text-red-600" : "text-violet-600",
    },
  };
  const { Icon, color } = STYLE[highlight.type] ?? {
    Icon: Clock,
    color: "text-slate-400",
  };
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-slate-700">{highlight.description}</p>
        <p className="text-[10px] text-slate-400">
          {format(new Date(highlight.date), "dd MMM yyyy")}
          {highlight.reason && ` · ${REASON_LABELS[highlight.reason]?.label ?? latenessReasonLabel(highlight.reason)}`}
        </p>
      </div>
    </li>
  );
}
