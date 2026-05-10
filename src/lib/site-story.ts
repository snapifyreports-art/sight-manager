import type { Prisma, PrismaClient } from "@prisma/client";

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
  };
  plotStories: PlotStory[];
  contractorPerformance: ContractorPerf[];
  quoteBoard: QuoteEntry[];
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
  type:
    | "JOB_STARTED"
    | "JOB_COMPLETED"
    | "JOB_SIGNED_OFF"
    | "DELAY"
    | "JOURNAL"
    | "SNAG"
    | "PHOTO";
  description: string;
  jobName?: string;
  reason?: string;
  imageUrl?: string;
  caption?: string;
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

// Working-day helpers — local copy so this file stays standalone.
// Mirror src/lib/working-days.ts logic but inlined to avoid the lib's
// dev-date side effects which are server-request-scoped.
function workingDaysBetween(a: Date, b: Date): number {
  if (!a || !b) return 0;
  const start = new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
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

  const reasonCounts = new Map<string, number>();
  let weatherDelayDays = 0;
  let otherDelayDays = 0;
  for (const ev of delayEvents) {
    const reason = ev.delayReasonType ?? "OTHER";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

    // Parse "delayed N day(s)" out of the description for accumulation
    const match = ev.description?.match(/delayed (\d+) day/i);
    const days = match ? parseInt(match[1], 10) : 1;
    if (reason === "WEATHER_RAIN" || reason === "WEATHER_TEMPERATURE") {
      weatherDelayDays += days;
    } else {
      otherDelayDays += days;
    }
  }
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
        type: {
          in: [
            "JOB_STARTED",
            "JOB_COMPLETED",
            "JOB_SIGNED_OFF",
            "SCHEDULE_CASCADED",
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        plotId: true,
        delayReasonType: true,
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
      const list = eventsByPlot.get(ev.plotId) ?? [];
      list.push({
        date: ev.createdAt.toISOString(),
        type:
          ev.type === "SCHEDULE_CASCADED"
            ? "DELAY"
            : (ev.type as PlotHighlight["type"]),
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
    },
    plotStories,
    contractorPerformance,
    quoteBoard,
  };
}
