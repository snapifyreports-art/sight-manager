import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { DashboardClient, type DashboardData } from "@/components/dashboard/DashboardClient";
import { whereJobEndOverdue } from "@/lib/lateness";
import { differenceInWorkingDays } from "@/lib/working-days";
import { cookies } from "next/headers";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | Sight Manager",
};

export default async function DashboardPage() {
  const session = await auth();
  const siteIds = session
    ? await getUserSiteIds(session.user.id, session.user.role)
    : null;

  // (May 2026 audit D-P1-1) Dev-date aware "today" for working-day
  // arithmetic on the At-Risk panel rows below. Pre-fix the panel
  // computed days-late on the client from `Date.now()` (calendar days
  // + browser wall clock), which disagreed with the Lateness SSOT
  // (working days + server). Compute server-side here and ship the
  // pre-computed `daysLate` field on each row so the panel stays
  // consistent with /api/lateness and LatenessSummary.
  const cookieStore = await cookies();
  const today = getServerCurrentDate({
    cookies: { get: (n: string) => cookieStore.get(n) ?? undefined },
  });
  today.setHours(0, 0, 0, 0);

  // Build where clauses for site-filtered queries
  const siteWhere = siteIds !== null ? { id: { in: siteIds } } : {};
  const jobSiteWhere = siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};
  const orderSiteWhere = siteIds !== null ? { job: { plot: { siteId: { in: siteIds } } } } : {};
  const eventSiteWhere = siteIds !== null ? { siteId: { in: siteIds } } : {};

  // Run all queries in parallel for performance
  const [
    totalSites,
    totalContacts,
    orderStatusCounts,
    jobStatusCounts,
    recentEvents,
    trafficLightJobs,
    overdueJobs,
    staleSnags,
    // (May 2026 audit follow-up to #152) Sites the current user is
    // watching — surface them as a dashboard widget so the manager
    // sees what's on their personal radar without trawling the sites
    // page. Skipped when session is null because we already auth-gate
    // higher up the layout chain.
    watchedSites,
  ] = await Promise.all([
    // Total sites (filtered)
    prisma.site.count({ where: siteWhere }),

    // Total contacts (not site-specific)
    prisma.contact.count(),

    // Orders grouped by status (filtered)
    prisma.materialOrder.groupBy({
      by: ["status"],
      where: orderSiteWhere,
      _count: { status: true },
    }),

    // Jobs grouped by status (filtered, leaf-only — parents are derived rollups)
    prisma.job.groupBy({
      by: ["status"],
      where: { ...jobSiteWhere, children: { none: {} } },
      _count: { status: true },
    }),

    // Recent 10 events with relations (filtered)
    // (May 2026 audit #78) id tiebreaker for stable ordering when
    // multiple events share a createdAt millisecond.
    prisma.eventLog.findMany({
      take: 10,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: eventSiteWhere,
      include: {
        user: { select: { name: true } },
        site: { select: { id: true, name: true } },
        job: { select: { id: true, name: true } },
      },
    }),

    // Jobs for traffic light display (filtered, leaf-only).
    // (#168) Sort chronologically by startDate so the dashboard reads
    // like the programme itself — Keith expects every job list in the
    // app to be in start-date order with sortOrder as a tiebreaker.
    prisma.job.findMany({
      take: 12,
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
      where: {
        status: { in: ["IN_PROGRESS", "ON_HOLD", "NOT_STARTED"] },
        ...jobSiteWhere,
        children: { none: {} },
      },
      select: {
        id: true,
        name: true,
        status: true,
        plot: {
          select: {
            name: true,
            site: { select: { name: true } },
          },
        },
        assignedTo: { select: { name: true } },
      },
    }),

    // (May 2026 audit #46 / #177) At-Risk overdue jobs — same SSOT
    // definition as Daily Brief and Tasks via whereJobEndOverdue.
    prisma.job.findMany({
      take: 8,
      where: {
        ...whereJobEndOverdue(new Date()),
        ...jobSiteWhere,
        children: { none: {} },
      },
      orderBy: { endDate: "asc" },
      select: {
        id: true,
        name: true,
        endDate: true,
        plot: {
          select: {
            id: true,
            name: true,
            plotNumber: true,
            site: { select: { id: true, name: true } },
          },
        },
      },
    }),

    // (May 2026 audit #46) At-Risk: stale open snags — open more
    // than 30 days. Surfaces things slipping through the cracks.
    prisma.snag.findMany({
      take: 8,
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ...(siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        description: true,
        createdAt: true,
        priority: true,
        plot: {
          select: {
            id: true,
            name: true,
            plotNumber: true,
            site: { select: { id: true, name: true } },
          },
        },
      },
    }),

    // (May 2026 audit follow-up to #152) Watched sites for the current
    // user — includes a few headline numbers per site so the widget
    // can render without a second round-trip.
    session
      ? prisma.watchedSite.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          select: {
            site: {
              select: {
                id: true,
                name: true,
                location: true,
                status: true,
                _count: { select: { plots: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // Build the job status map with defaults
  const jobsByStatus = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
  };

  for (const row of jobStatusCounts) {
    jobsByStatus[row.status] = row._count.status;
  }

  const totalJobs = jobsByStatus.NOT_STARTED + jobsByStatus.IN_PROGRESS + jobsByStatus.ON_HOLD + jobsByStatus.COMPLETED;

  // Build order status counts
  const ordersByStatus: Record<string, number> = {};
  for (const row of orderStatusCounts) {
    ordersByStatus[row.status] = row._count.status;
  }
  const totalOrders = Object.values(ordersByStatus).reduce((a, b) => a + b, 0);
  const ordersToSend = ordersByStatus["PENDING"] ?? 0;
  const awaitingDelivery = (ordersByStatus["ORDERED"] ?? 0);
  const deliveredOrders = ordersByStatus["DELIVERED"] ?? 0;

  // Serialize dates for client component
  const data: DashboardData = {
    stats: {
      totalSites,
      totalJobs,
      inProgressJobs: jobsByStatus.IN_PROGRESS,
      totalOrders,
      ordersToSend,
      awaitingDelivery,
      deliveredOrders,
      totalContacts,
    },
    jobsByStatus,
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
      user: event.user,
      site: event.site,
      job: event.job,
    })),
    trafficLightJobs,
    // (May 2026 audit #46 + D-P1-1) At-Risk panel feeds. `daysLate` is
    // pre-computed server-side using working-day arithmetic anchored to
    // the dev-date-aware `today` so it stays consistent with the
    // Lateness SSOT (in-app LatenessSummary headline + Weekly Digest).
    overdueJobs: overdueJobs.map((j) => ({
      id: j.id,
      name: j.name,
      endDate: j.endDate?.toISOString() ?? null,
      daysLate: j.endDate
        ? Math.max(0, differenceInWorkingDays(today, j.endDate))
        : 0,
      plot: j.plot,
    })),
    staleSnags: staleSnags.map((s) => ({
      id: s.id,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
      daysOpen: Math.max(0, differenceInWorkingDays(today, s.createdAt)),
      priority: s.priority,
      plot: s.plot,
    })),
    watchedSites: watchedSites.map((w) => ({
      id: w.site.id,
      name: w.site.name,
      location: w.site.location,
      status: w.site.status,
      plotCount: w.site._count.plots,
    })),
    // (May 2026 audit #168 + D-P0-2) Plots over budget.
    //
    // Pre-fix: actual cost was `delivered_quantity * plotMaterial.unitCost`
    // — same unitCost used for both budget AND actual, so cost overrun
    // could only fire via over-delivery (more units than budgeted). If
    // the supplier raised the unit price post-order but quantities
    // matched, the panel said "on budget".
    //
    // Fix: separate the sources.
    //   Budget = sum(PlotMaterial.quantity * PlotMaterial.unitCost)
    //   Actual = sum(MaterialOrder.totalCost where DELIVERED + plot match)
    // The actual side now reflects real invoice totals, catching both
    // over-delivery AND unit-price overruns.
    plotsOverBudget: await (async () => {
      const plotWhere: Prisma.PlotWhereInput =
        siteIds !== null
          ? { siteId: { in: siteIds } }
          : { site: { status: { not: "COMPLETED" } } };

      const [matRows, orderRows] = await Promise.all([
        prisma.plotMaterial.findMany({
          where: { plot: plotWhere },
          select: {
            plotId: true,
            quantity: true,
            unitCost: true,
            plot: {
              select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } },
            },
          },
          take: 5000,
        }),
        prisma.materialOrder.findMany({
          where: {
            status: "DELIVERED",
            ...(siteIds !== null
              ? { OR: [{ plot: { siteId: { in: siteIds } } }, { job: { plot: { siteId: { in: siteIds } } } }] }
              : {}),
          },
          select: {
            plotId: true,
            job: { select: { plotId: true } },
            orderItems: { select: { quantity: true, unitCost: true } },
          },
          take: 5000,
        }),
      ]);

      const map = new Map<
        string,
        { id: string; name: string; plotNumber: string | null; siteId: string; siteName: string; budgeted: number; actual: number }
      >();
      for (const r of matRows) {
        const k = r.plotId;
        const cur = map.get(k) ?? {
          id: r.plot.id,
          name: r.plot.name,
          plotNumber: r.plot.plotNumber,
          siteId: r.plot.siteId,
          siteName: r.plot.site.name,
          budgeted: 0,
          actual: 0,
        };
        cur.budgeted += (r.quantity ?? 0) * (r.unitCost ?? 0);
        map.set(k, cur);
      }
      for (const o of orderRows) {
        const plotKey = o.plotId ?? o.job?.plotId ?? null;
        if (!plotKey) continue;
        const cur = map.get(plotKey);
        if (!cur) continue; // orders for plots with no PlotMaterial seeded skip
        const lineTotal = o.orderItems.reduce(
          (sum, it) => sum + (it.quantity ?? 0) * (it.unitCost ?? 0),
          0,
        );
        cur.actual += lineTotal;
      }
      return Array.from(map.values())
        .map((p) => ({ ...p, overrun: p.actual - p.budgeted }))
        .filter((p) => p.overrun > 0)
        .sort((a, b) => b.overrun - a.overrun)
        .slice(0, 8);
    })(),
  };

  return <DashboardClient data={data} />;
}
