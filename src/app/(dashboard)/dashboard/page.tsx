import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { DashboardClient, type DashboardData } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | Sight Manager",
};

export default async function DashboardPage() {
  const session = await auth();
  const siteIds = session
    ? await getUserSiteIds(session.user.id, session.user.role)
    : null;

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

    // Jobs for traffic light display (filtered, leaf-only)
    prisma.job.findMany({
      take: 12,
      orderBy: { updatedAt: "desc" },
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

    // (May 2026 audit #46) At-Risk: overdue jobs (endDate passed,
    // status not COMPLETED, leaf-only). Sorted by how overdue they
    // are so the worst floats to the top.
    prisma.job.findMany({
      take: 8,
      where: {
        endDate: { lt: new Date() },
        status: { not: "COMPLETED" },
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
    // (May 2026 audit #46) At-Risk panel feeds.
    overdueJobs: overdueJobs.map((j) => ({
      id: j.id,
      name: j.name,
      endDate: j.endDate?.toISOString() ?? null,
      plot: j.plot,
    })),
    staleSnags: staleSnags.map((s) => ({
      id: s.id,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
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
    // (May 2026 audit #168) Plots over budget — actual delivered
    // material cost exceeds expected. Lightweight derivation from
    // PlotMaterial so we don't HTTP-self-call the budget-report
    // route. Skipped when siteIds = null + result set is huge —
    // capped at first 200 plots in scope, ranked by overrun.
    plotsOverBudget: await (async () => {
      const rows = await prisma.plotMaterial.findMany({
        where: siteIds !== null
          ? { plot: { siteId: { in: siteIds } } }
          : { plot: { site: { status: { not: "COMPLETED" } } } },
        select: {
          plotId: true,
          quantity: true,
          delivered: true,
          unitCost: true,
          plot: {
            select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } },
          },
        },
        take: 5000,
      });
      const map = new Map<
        string,
        { id: string; name: string; plotNumber: string | null; siteId: string; siteName: string; budgeted: number; actual: number }
      >();
      for (const r of rows) {
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
        cur.actual += (r.delivered ?? 0) * (r.unitCost ?? 0);
        map.set(k, cur);
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
