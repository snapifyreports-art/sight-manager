import type { Prisma, PrismaClient, EventType } from "@prisma/client";
import { differenceInWorkingDays } from "./working-days";

/**
 * Site Story synthesizer — single source of truth for "what actually
 * happened on this build". Both the Site Story tab API
 * (`/api/sites/[id]/story`) and the Handover ZIP generator call this,
 * so the two artefacts can never drift apart.
 *
 * Returns a structured object that downstream renderers (HTML page +
 * jsPDF) walk to produce their respective views.
 *
 * Reads only — never mutates.
 */

type Tx = PrismaClient | Prisma.TransactionClient;

export interface SiteStory {
  site: {
    id: string;
    name: string;
    location: string | null;
    address: string | null;
    postcode: string | null;
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
  milestones: SiteMilestone[];
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
    /** (#174) Snag breakdown for the Story tab summary — by priority,
     *  by location, by contractor; plus a recent-snag feed and the
     *  median resolve time when resolved snags exist. */
    snagsByPriority: { HIGH: number; MEDIUM: number; LOW: number };
    snagsByLocation: { location: string; count: number }[];
    snagsByContractor: {
      contactId: string;
      name: string;
      company: string | null;
      count: number;
      openCount: number;
      resolvedCount: number;
    }[];
    snagMedianResolveDays: number | null;
    recentSnags: {
      id: string;
      description: string;
      status: string;
      priority: string;
      location: string | null;
      plotNumber: string | null;
      raisedAt: string;
      resolvedAt: string | null;
    }[];
  };
  plotStories: PlotStory[];
  contractorPerformance: ContractorPerf[];
  quoteBoard: QuoteEntry[];
  // (May 2026 Keith request) Orders belong in the Story too — what was
  // ordered across the build, what arrived, and how the materials side
  // performed (late sends, late deliveries, busiest suppliers).
  orders: {
    totalOrders: number;
    delivered: number;
    /** PENDING + ORDERED-but-not-delivered. */
    outstanding: number;
    /** Times an order went out after its planned send date — counted
     *  from the ORDER_SEND_OVERDUE lateness events. */
    sentLate: number;
    /** Orders whose deliveredDate landed after the expected date. */
    deliveredLate: number;
    topSuppliers: { name: string; orderCount: number }[];
  };
}

export interface SiteMilestone {
  key: string;
  label: string;
  date: string | null;
}

export interface PlotStory {
  id: string;
  plotNumber: string | null;
  name: string;
  houseType: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
  buildCompletePercent: number;
  startedAt: string | null;
  completedAt: string | null;
  // Variance vs original plan: positive = late finish, negative = early finish
  daysVarianceWorking: number | null;
  delayCount: number;
  weatherImpactDays: number;
  snagCount: number;
  snagsOpen: number;
  photoCount: number;
  journalEntryCount: number;
  // Top events surfaced for the per-plot timeline
  highlights: PlotHighlight[];
}

export interface PlotHighlight {
  // ISO date — kept as string for serialization
  date: string;
  // (May 2026 Story-completeness pass) Widened from 7 to 11 categories —
  // ORDER / LATENESS / WEATHER / MILESTONE were added so a plot's
  // timeline shows order timing, late events, weather days and the
  // plot/handover milestones, not just job + delay events.
  type:
    | "JOB_STARTED"
    | "JOB_COMPLETED"
    | "JOB_SIGNED_OFF"
    | "DELAY"
    | "JOURNAL"
    | "SNAG"
    | "PHOTO"
    | "ORDER"
    | "LATENESS"
    | "WEATHER"
    | "MILESTONE";
  description: string;
  jobName?: string;
  reason?: string;
  imageUrl?: string;
  caption?: string;
}

/**
 * (May 2026 Story-completeness pass) Maps an EventLog `type` onto the
 * coarser `PlotHighlight.type` the timeline UI renders. Returns null
 * for events that shouldn't appear in a per-plot timeline — e.g. a
 * USER_ACTION that isn't snag-related (document upload, toolbox talk).
 */
function highlightTypeForEvent(
  eventType: EventType,
  detail: unknown,
): PlotHighlight["type"] | null {
  switch (eventType) {
    case "JOB_STARTED":
      return "JOB_STARTED";
    case "JOB_COMPLETED":
      return "JOB_COMPLETED";
    case "JOB_SIGNED_OFF":
      return "JOB_SIGNED_OFF";
    case "SCHEDULE_CASCADED":
      return "DELAY";
    case "ORDER_PLACED":
    case "ORDER_SENT":
    case "DELIVERY_CONFIRMED":
    case "DELIVERY_LATE":
    case "ORDER_CANCELLED":
      return "ORDER";
    case "SNAG_CREATED":
    case "SNAG_RESOLVED":
      return "SNAG";
    case "PHOTO_UPLOADED":
    case "PHOTO_SHARED":
      return "PHOTO";
    case "LATENESS_OPENED":
    case "LATENESS_RESOLVED":
      return "LATENESS";
    case "WEATHER_IMPACT":
      return "WEATHER";
    case "PLOT_COMPLETED":
    case "HANDOVER_COMPLETED":
      return "MILESTONE";
    case "USER_ACTION":
      // Only snag-related user-actions (close / status change /
      // contractor sign-off carry detail.snagId) earn a timeline row.
      return detail &&
        typeof detail === "object" &&
        "snagId" in (detail as Record<string, unknown>)
        ? "SNAG"
        : null;
    default:
      return null;
  }
}

export interface ContractorPerf {
  contactId: string;
  name: string;
  company: string | null;
  jobsAssigned: number;
  jobsCompleted: number;
  jobsOnTime: number;
  jobsLate: number;
  totalDelayDaysAttributed: number;
}

export interface QuoteEntry {
  source: "JOURNAL" | "JOB_NOTE" | "PHOTO_CAPTION";
  date: string;
  plotNumber: string | null;
  body: string;
  authorName?: string;
}

interface BuildOptions {
  /** When true, include heavier per-plot data (photos, full event lists)
   *  for the ZIP renderer. Default false keeps payload small for the UI. */
  includeFullDetail?: boolean;
}

// (May 2026 audit D-P1-7) Local `workingDaysBetween` removed. The
// previous justification ("avoid lib side effects") is stale —
// `src/lib/working-days.ts` is pure since the audit cleanup. Importing
// `differenceInWorkingDays` keeps the SSOT intact: any future change
// to working-day rules (e.g. bank-holiday handling) lands in one place.
//
// Callers below previously got 0 for end<=start. The SSOT helper returns
// a signed delta, so callers clamp with Math.max(0, ...).
function workingDaysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, differenceInWorkingDays(b, a));
}

export async function buildSiteStory(
  tx: Tx,
  siteId: string,
  options: BuildOptions = {},
): Promise<SiteStory> {
  const includeFull = options.includeFullDetail === true;

  const site = await tx.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      postcode: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const plots = await tx.plot.findMany({
    where: { siteId },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      plotNumber: true,
      name: true,
      houseType: true,
      buildCompletePercent: true,
      createdAt: true,
      // We compute status + lifecycle dates from leaf jobs, not the
      // (no-longer-existing) Plot.status field.
      jobs: {
        where: { children: { none: {} } },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          originalStartDate: true,
          originalEndDate: true,
        },
      },
      _count: {
        select: {
          journalEntries: true,
          snags: true,
        },
      },
    },
  });

  const plotIds = plots.map((p) => p.id);

  // ─── Orders / materials ─────────────────────────────────────────────
  // (May 2026 Keith request) The Story covers the materials side too:
  // what was ordered, what arrived, how it performed. "Sent late" comes
  // from the ORDER_SEND_OVERDUE lateness events (the order's own
  // dateOfOrder is overwritten on send, so the lateness row is the SSOT
  // for "this went out late").
  const storyOrders =
    plotIds.length === 0
      ? []
      : await tx.materialOrder.findMany({
          where: { job: { plotId: { in: plotIds } } },
          select: {
            status: true,
            expectedDeliveryDate: true,
            deliveredDate: true,
            supplier: { select: { name: true } },
          },
        });
  const orderSentLateCount = await tx.latenessEvent.count({
    where: { siteId, kind: "ORDER_SEND_OVERDUE" },
  });
  const ordersDelivered = storyOrders.filter(
    (o) => o.status === "DELIVERED",
  ).length;
  const ordersOutstanding = storyOrders.filter(
    (o) => o.status === "PENDING" || o.status === "ORDERED",
  ).length;
  const ordersDeliveredLate = storyOrders.filter(
    (o) =>
      !!o.deliveredDate &&
      !!o.expectedDeliveryDate &&
      o.deliveredDate > o.expectedDeliveryDate,
  ).length;
  const supplierOrderCounts = new Map<string, number>();
  for (const o of storyOrders) {
    const name = o.supplier?.name ?? "Unknown supplier";
    supplierOrderCounts.set(name, (supplierOrderCounts.get(name) ?? 0) + 1);
  }
  const topStorySuppliers = Array.from(supplierOrderCounts.entries())
    .map(([name, orderCount]) => ({ name, orderCount }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5);

  // ─── Site-level aggregates ──────────────────────────────────────────
  const allLeafJobs = plots.flatMap((p) => p.jobs);
  const plotsCompleted = plots.filter(
    (p) => p.jobs.length > 0 && p.jobs.every((j) => j.status === "COMPLETED"),
  ).length;
  const plotsInProgress = plots.filter((p) =>
    p.jobs.some((j) => j.status === "IN_PROGRESS"),
  ).length;
  const plotsNotStarted = plots.length - plotsCompleted - plotsInProgress;

  const overallPercent =
    plots.length === 0
      ? 0
      : plots.reduce((sum, p) => sum + (p.buildCompletePercent ?? 0), 0) /
        plots.length;

  // Days elapsed: from earliest job start (any plot) to today (or
  // completedAt if site is closed). Original plan: earliest original
  // start to latest original end.
  const earliestActualStart = allLeafJobs
    .map((j) => j.actualStartDate)
    .filter((d): d is Date => !!d)
    .reduce<Date | null>((min, d) => (!min || d < min ? d : min), null);
  const latestActualEnd = allLeafJobs
    .map((j) => j.actualEndDate)
    .filter((d): d is Date => !!d)
    .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
  const earliestOriginalStart = allLeafJobs
    .map((j) => j.originalStartDate)
    .reduce<Date | null>((min, d) => (!min || d < min ? d : min), null);
  const latestOriginalEnd = allLeafJobs
    .map((j) => j.originalEndDate)
    .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);

  const elapsedAnchor = site.completedAt ?? new Date();
  const daysElapsed = earliestActualStart
    ? workingDaysBetween(earliestActualStart, elapsedAnchor)
    : 0;
  const daysOriginalPlan =
    earliestOriginalStart && latestOriginalEnd
      ? workingDaysBetween(earliestOriginalStart, latestOriginalEnd)
      : null;
  const actualEnd = latestActualEnd ?? elapsedAnchor;
  const daysActual = earliestActualStart
    ? workingDaysBetween(earliestActualStart, actualEnd)
    : null;
  const daysVarianceWorking =
    daysActual != null && daysOriginalPlan != null
      ? daysActual - daysOriginalPlan
      : null;

  // ─── Milestones ─────────────────────────────────────────────────────
  const firstStart = earliestActualStart;
  const firstPlotComplete = plots
    .filter(
      (p) =>
        p.jobs.length > 0 && p.jobs.every((j) => j.status === "COMPLETED"),
    )
    .map((p) =>
      p.jobs
        .map((j) => j.actualEndDate)
        .filter((d): d is Date => !!d)
        .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null),
    )
    .filter((d): d is Date => !!d)
    .reduce<Date | null>((min, d) => (!min || d < min ? d : min), null);

  const halfwayPlotComplete =
    plotsCompleted >= Math.ceil(plots.length / 2) && plots.length > 0
      ? // The completion date of the median completed plot
        (() => {
          const completed = plots
            .filter((p) =>
              p.jobs.every((j) => j.status === "COMPLETED"),
            )
            .map((p) =>
              p.jobs
                .map((j) => j.actualEndDate)
                .filter((d): d is Date => !!d)
                .reduce<Date | null>(
                  (max, d) => (!max || d > max ? d : max),
                  null,
                ),
            )
            .filter((d): d is Date => !!d)
            .sort((a, b) => a.getTime() - b.getTime());
          const mid = completed[Math.floor(completed.length / 2)];
          return mid ?? null;
        })()
      : null;

  const milestones: SiteMilestone[] = [
    {
      key: "site-created",
      label: "Site created",
      date: site.createdAt.toISOString(),
    },
    {
      key: "first-job-started",
      label: "First plot started",
      date: firstStart?.toISOString() ?? null,
    },
    {
      key: "first-plot-complete",
      label: "First plot complete",
      date: firstPlotComplete?.toISOString() ?? null,
    },
    {
      key: "halfway",
      label: "Halfway through plots",
      date: halfwayPlotComplete?.toISOString() ?? null,
    },
    {
      key: "site-completed",
      label: "Site closed",
      date: site.completedAt?.toISOString() ?? null,
    },
  ];

  // ─── Variance summary ───────────────────────────────────────────────
  // (May 2026 audit D-P0-1) Pre-fix this regex-parsed EventLog
  // `description` strings for "delayed N day(s)" — only matched one
  // cascade-trigger's format. Cascades from /api/jobs/[id]/cascade
  // ("Schedule cascaded from … — +N WD") and the recent EXPAND_JOB
  // ("Delivery push → expand job: end +N WD") didn't match the regex,
  // so they fell back to "1 day" each. A site with 12 cascade events
  // worth 47 WD reported as "12 WD lost". Silent.
  //
  // Now read from LatenessEvent — the canonical "days late" store. It
  // has structured `daysLate` and `reasonCode` columns; no parsing
  // needed. Includes both open and resolved events so the historical
  // narrative is preserved.
  //
  // We also keep the EventLog list around for the timeline (delayEvents
  // is referenced elsewhere in this file for the per-plot narrative),
  // but only as a fallback if LatenessEvent has no entries — e.g. for
  // sites that pre-date the lateness rollout (April 2026).
  const latenessForVariance = await tx.latenessEvent.findMany({
    where: { siteId },
    select: { daysLate: true, reasonCode: true, plotId: true, jobId: true, id: true, wentLateOn: true },
  });

  const reasonCounts = new Map<string, number>();
  let weatherDelayDays = 0;
  let otherDelayDays = 0;

  if (latenessForVariance.length > 0) {
    for (const ev of latenessForVariance) {
      const reason = ev.reasonCode;
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      if (reason === "WEATHER_RAIN" || reason === "WEATHER_TEMPERATURE" || reason === "WEATHER_WIND") {
        weatherDelayDays += ev.daysLate;
      } else {
        otherDelayDays += ev.daysLate;
      }
    }
  } else {
    // Legacy fallback for sites with no LatenessEvent rows yet. Counts
    // each cascade as +1 day (the old behaviour) so a pre-lateness site
    // still shows reason breakdown.
    const legacyDelayEvents = await tx.eventLog.findMany({
      where: { siteId, type: "SCHEDULE_CASCADED", delayReasonType: { not: null } },
      select: { delayReasonType: true },
    });
    for (const ev of legacyDelayEvents) {
      const reason = ev.delayReasonType ?? "OTHER";
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      if (reason === "WEATHER_RAIN" || reason === "WEATHER_TEMPERATURE") {
        weatherDelayDays += 1;
      } else {
        otherDelayDays += 1;
      }
    }
  }

  // EventLog list for the timeline narrative below — referenced when
  // emitting per-plot story rows. Reads the same SCHEDULE_CASCADED rows
  // regardless of the new vs legacy variance path above.
  const delayEvents = await tx.eventLog.findMany({
    where: {
      siteId,
      type: "SCHEDULE_CASCADED",
      delayReasonType: { not: null },
    },
    select: {
      id: true,
      delayReasonType: true,
      description: true,
      createdAt: true,
      plotId: true,
      jobId: true,
    },
  });

  const delayReasonBreakdown = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const rainedOff = await tx.rainedOffDay.findMany({
    where: { siteId },
    select: { type: true },
  });
  const totalRainDays = rainedOff.filter((r) => r.type === "RAIN").length;
  const totalTemperatureDays = rainedOff.filter(
    (r) => r.type === "TEMPERATURE",
  ).length;

  const snagSummary = await tx.snag.groupBy({
    by: ["status"],
    where: { plotId: { in: plotIds } },
    _count: true,
  });
  const snagsRaised = snagSummary.reduce((sum, s) => sum + s._count, 0);
  const snagsResolved =
    snagSummary.find((s) => s.status === "RESOLVED")?._count ?? 0;
  const snagsOpen = snagsRaised - snagsResolved;

  // (#174) Rich snag breakdown for the Story tab. Pull every snag for
  // the site once and aggregate in memory — typical sites are < 500
  // snags so this stays cheap.
  const allSnags = await tx.snag.findMany({
    where: { plotId: { in: plotIds } },
    select: {
      id: true,
      description: true,
      status: true,
      priority: true,
      location: true,
      createdAt: true,
      resolvedAt: true,
      contactId: true,
      contact: { select: { name: true, company: true } },
      plot: { select: { plotNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const snagsByPriority = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const locationCounts = new Map<string, number>();
  const contractorAgg = new Map<
    string,
    {
      contactId: string;
      name: string;
      company: string | null;
      count: number;
      openCount: number;
      resolvedCount: number;
    }
  >();
  const resolveDays: number[] = [];
  for (const s of allSnags) {
    const pri = (s.priority ?? "MEDIUM") as keyof typeof snagsByPriority;
    if (pri in snagsByPriority) snagsByPriority[pri]++;
    if (s.location) {
      locationCounts.set(s.location, (locationCounts.get(s.location) ?? 0) + 1);
    }
    if (s.contactId && s.contact) {
      const existing = contractorAgg.get(s.contactId) ?? {
        contactId: s.contactId,
        name: s.contact.name,
        company: s.contact.company,
        count: 0,
        openCount: 0,
        resolvedCount: 0,
      };
      existing.count++;
      if (s.status === "RESOLVED" || s.status === "CLOSED") existing.resolvedCount++;
      else existing.openCount++;
      contractorAgg.set(s.contactId, existing);
    }
    if (s.resolvedAt && s.createdAt) {
      const days =
        (s.resolvedAt.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (days >= 0) resolveDays.push(days);
    }
  }
  const snagsByLocation = Array.from(locationCounts.entries())
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const snagsByContractor = Array.from(contractorAgg.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const snagMedianResolveDays = resolveDays.length > 0
    ? Math.round(
        ([...resolveDays].sort((a, b) => a - b)[Math.floor(resolveDays.length / 2)] ?? 0) * 10,
      ) / 10
    : null;
  const recentSnags = allSnags.slice(0, 10).map((s) => ({
    id: s.id,
    description: s.description,
    status: s.status,
    priority: s.priority ?? "MEDIUM",
    location: s.location,
    plotNumber: s.plot.plotNumber,
    raisedAt: s.createdAt.toISOString(),
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
  }));

  // On-time completion = plots where every leaf job's actualEndDate
  // <= originalEndDate. Edge: plots not yet complete excluded.
  const onTimeCount = plots.filter((p) => {
    if (p.jobs.length === 0 || p.jobs.some((j) => j.status !== "COMPLETED"))
      return false;
    return p.jobs.every(
      (j) =>
        j.actualEndDate && j.actualEndDate.getTime() <= j.originalEndDate.getTime(),
    );
  }).length;
  const onTimePlotCompletionRate =
    plotsCompleted > 0 ? onTimeCount / plotsCompleted : 0;

  // ─── Per-plot stories ───────────────────────────────────────────────
  // Grouped queries to avoid N+1.
  const journalsByPlot = new Map<string, number>();
  for (const p of plots) {
    journalsByPlot.set(p.id, p._count.journalEntries);
  }

  const photoCountsByPlot = await tx.jobPhoto.groupBy({
    by: ["jobId"],
    where: { job: { plotId: { in: plotIds } } },
    _count: true,
  });
  const jobsForPlotMap = new Map<string, string>();
  const allJobsLite = await tx.job.findMany({
    where: { plotId: { in: plotIds } },
    select: { id: true, plotId: true },
  });
  for (const j of allJobsLite) jobsForPlotMap.set(j.id, j.plotId);
  const photoCountByPlot = new Map<string, number>();
  for (const row of photoCountsByPlot) {
    const plotId = jobsForPlotMap.get(row.jobId);
    if (!plotId) continue;
    photoCountByPlot.set(
      plotId,
      (photoCountByPlot.get(plotId) ?? 0) + row._count,
    );
  }

  const snagCountsByPlot = await tx.snag.groupBy({
    by: ["plotId", "status"],
    where: { plotId: { in: plotIds } },
    _count: true,
  });

  const plotStories: PlotStory[] = plots.map((p) => {
    const status: PlotStory["status"] =
      p.jobs.length === 0
        ? "NOT_STARTED"
        : p.jobs.every((j) => j.status === "COMPLETED")
          ? "COMPLETED"
          : p.jobs.some((j) => j.status === "IN_PROGRESS")
            ? "IN_PROGRESS"
            : p.jobs.some((j) => j.status === "ON_HOLD")
              ? "ON_HOLD"
              : "NOT_STARTED";

    const plotEarliestActual = p.jobs
      .map((j) => j.actualStartDate)
      .filter((d): d is Date => !!d)
      .reduce<Date | null>((min, d) => (!min || d < min ? d : min), null);
    const plotLatestActual = p.jobs
      .map((j) => j.actualEndDate)
      .filter((d): d is Date => !!d)
      .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
    const plotLatestOriginal = p.jobs
      .map((j) => j.originalEndDate)
      .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);
    const plotVariance =
      status === "COMPLETED" && plotLatestActual && plotLatestOriginal
        ? workingDaysBetween(plotLatestOriginal, plotLatestActual) -
          workingDaysBetween(plotLatestActual, plotLatestOriginal)
        : null;

    const plotDelays = delayEvents.filter((d) => d.plotId === p.id);
    const plotSnagCount = snagCountsByPlot
      .filter((r) => r.plotId === p.id)
      .reduce((sum, r) => sum + r._count, 0);
    const plotSnagsOpen = snagCountsByPlot
      .filter((r) => r.plotId === p.id && r.status !== "RESOLVED")
      .reduce((sum, r) => sum + r._count, 0);

    return {
      id: p.id,
      plotNumber: p.plotNumber,
      name: p.name,
      houseType: p.houseType,
      status,
      buildCompletePercent: p.buildCompletePercent,
      startedAt: plotEarliestActual?.toISOString() ?? null,
      completedAt:
        status === "COMPLETED" ? plotLatestActual?.toISOString() ?? null : null,
      daysVarianceWorking: plotVariance,
      delayCount: plotDelays.length,
      weatherImpactDays: 0,
      snagCount: plotSnagCount,
      snagsOpen: plotSnagsOpen,
      photoCount: photoCountByPlot.get(p.id) ?? 0,
      journalEntryCount: journalsByPlot.get(p.id) ?? 0,
      highlights: [], // populated below if includeFull
    };
  });

  // ─── Highlights per plot (only when full detail requested) ──────────
  if (includeFull && plotIds.length > 0) {
    // Pull a curated set of events per plot — start/complete/signoff,
    // delays, journal entries, top snag raise/resolve, top photos.
    const events = await tx.eventLog.findMany({
      where: {
        plotId: { in: plotIds },
        // (May 2026 Story-completeness pass) Pre-fix this whitelist was
        // 4 types — JOB_STARTED/COMPLETED/SIGNED_OFF + SCHEDULE_CASCADED
        // — so orders, snags, photos, lateness and weather were being
        // logged but never surfaced in a plot's timeline. Now every
        // event type with a per-plot meaning is pulled; the
        // highlightTypeForEvent() mapper decides what's noise.
        type: {
          in: [
            "JOB_STARTED",
            "JOB_COMPLETED",
            "JOB_SIGNED_OFF",
            "SCHEDULE_CASCADED",
            "ORDER_PLACED",
            "ORDER_SENT",
            "DELIVERY_CONFIRMED",
            "DELIVERY_LATE",
            "ORDER_CANCELLED",
            "SNAG_CREATED",
            "SNAG_RESOLVED",
            "PHOTO_UPLOADED",
            "PHOTO_SHARED",
            "LATENESS_OPENED",
            "LATENESS_RESOLVED",
            "WEATHER_IMPACT",
            "PLOT_COMPLETED",
            "HANDOVER_COMPLETED",
            "USER_ACTION",
          ],
        },
      },
      // (May 2026 audit #78) id tiebreaker so plot-story timelines
      // render in a stable order — cascade events can share a millisecond.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        plotId: true,
        delayReasonType: true,
        detail: true,
      },
    });
    const journals = await tx.plotJournalEntry.findMany({
      where: { plotId: { in: plotIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, plotId: true, body: true, createdAt: true },
    });

    const eventsByPlot = new Map<string, PlotHighlight[]>();
    for (const ev of events) {
      if (!ev.plotId) continue;
      const hlType = highlightTypeForEvent(ev.type, ev.detail);
      // null = an event with no per-plot timeline meaning (e.g. a
      // USER_ACTION that isn't snag-related) — skip so the timeline
      // stays signal, not noise.
      if (!hlType) continue;
      const list = eventsByPlot.get(ev.plotId) ?? [];
      list.push({
        date: ev.createdAt.toISOString(),
        type: hlType,
        description: ev.description,
        reason: ev.delayReasonType ?? undefined,
      });
      eventsByPlot.set(ev.plotId, list);
    }
    for (const j of journals) {
      const list = eventsByPlot.get(j.plotId) ?? [];
      list.push({
        date: j.createdAt.toISOString(),
        type: "JOURNAL",
        description: j.body.slice(0, 280),
      });
      eventsByPlot.set(j.plotId, list);
    }

    for (const ps of plotStories) {
      const list = eventsByPlot.get(ps.id) ?? [];
      list.sort((a, b) => a.date.localeCompare(b.date));
      ps.highlights = list;
    }
  }

  // ─── Contractor performance ─────────────────────────────────────────
  const contractorRows = await tx.jobContractor.findMany({
    where: { job: { plot: { siteId } } },
    select: {
      contactId: true,
      contact: { select: { name: true, company: true } },
      job: {
        select: {
          status: true,
          actualEndDate: true,
          originalEndDate: true,
          plot: { select: { siteId: true } },
        },
      },
    },
  });
  const contractorMap = new Map<string, ContractorPerf>();
  for (const r of contractorRows) {
    if (r.job.plot.siteId !== siteId) continue;
    const existing = contractorMap.get(r.contactId) ?? {
      contactId: r.contactId,
      name: r.contact.name,
      company: r.contact.company,
      jobsAssigned: 0,
      jobsCompleted: 0,
      jobsOnTime: 0,
      jobsLate: 0,
      totalDelayDaysAttributed: 0,
    };
    existing.jobsAssigned++;
    if (r.job.status === "COMPLETED") {
      existing.jobsCompleted++;
      if (
        r.job.actualEndDate &&
        r.job.actualEndDate.getTime() <= r.job.originalEndDate.getTime()
      ) {
        existing.jobsOnTime++;
      } else if (r.job.actualEndDate) {
        existing.jobsLate++;
        existing.totalDelayDaysAttributed += workingDaysBetween(
          r.job.originalEndDate,
          r.job.actualEndDate,
        );
      }
    }
    contractorMap.set(r.contactId, existing);
  }
  const contractorPerformance = Array.from(contractorMap.values()).sort(
    (a, b) => b.jobsCompleted - a.jobsCompleted,
  );

  // ─── Quote board (best journal entries + standout job notes) ────────
  const quoteBoard: QuoteEntry[] = [];
  if (includeFull) {
    const recentJournals = await tx.plotJournalEntry.findMany({
      where: { plotId: { in: plotIds } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        body: true,
        createdAt: true,
        plot: { select: { plotNumber: true } },
        createdBy: { select: { name: true } },
      },
    });
    for (const j of recentJournals) {
      // Filter for entries that look "story-worthy" — > 60 chars
      if (j.body.trim().length < 60) continue;
      quoteBoard.push({
        source: "JOURNAL",
        date: j.createdAt.toISOString(),
        plotNumber: j.plot.plotNumber,
        body: j.body,
        authorName: j.createdBy?.name,
      });
    }
  }

  return {
    site: {
      ...site,
      createdAt: site.createdAt.toISOString(),
      completedAt: site.completedAt?.toISOString() ?? null,
    },
    overview: {
      plotCount: plots.length,
      plotsCompleted,
      plotsInProgress,
      plotsNotStarted,
      overallPercent,
      daysElapsed,
      daysOriginalPlan,
      daysVarianceWorking,
    },
    milestones,
    variance: {
      totalDelayDaysWeather: weatherDelayDays,
      totalDelayDaysOther: otherDelayDays,
      totalRainDays,
      totalTemperatureDays,
      delayReasonBreakdown,
      onTimePlotCompletionRate,
      snagsRaised,
      snagsResolved,
      snagsOpen,
      snagsByPriority,
      snagsByLocation,
      snagsByContractor,
      snagMedianResolveDays,
      recentSnags,
    },
    plotStories,
    contractorPerformance,
    quoteBoard,
    orders: {
      totalOrders: storyOrders.length,
      delivered: ordersDelivered,
      outstanding: ordersOutstanding,
      sentLate: orderSentLateCount,
      deliveredLate: ordersDeliveredLate,
      topSuppliers: topStorySuppliers,
    },
  };
}
