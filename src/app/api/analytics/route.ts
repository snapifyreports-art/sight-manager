import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

// GET /api/analytics — aggregated analytics data
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId"); // optional filter

  const siteFilter = siteId ? { siteId } : {};
  const plotFilter = siteId
    ? { plot: { siteId } }
    : {};

  // Run queries in small batches to avoid exhausting Supabase connection pool.
  // All job-level analytics use LEAF jobs only (parents are derived rollups).
  const [sites, plots, jobs] = await Promise.all([
    prisma.site.findMany({
      where: siteId ? { id: siteId } : {},
      select: {
        id: true,
        name: true,
        status: true,
        plots: {
          select: {
            id: true,
            buildCompletePercent: true,
            jobs: {
              where: { children: { none: {} } },
              select: {
                id: true,
                status: true,
                startDate: true,
                endDate: true,
                actualStartDate: true,
                actualEndDate: true,
                name: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    }),
    prisma.plot.count({ where: siteFilter }),
    prisma.job.findMany({
      where: { ...plotFilter, children: { none: {} } },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        actualStartDate: true,
        actualEndDate: true,
        sortOrder: true,
        plot: {
          select: {
            siteId: true,
            site: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const [orders, orderItems] = await Promise.all([
    prisma.materialOrder.findMany({
      where: plotFilter.plot ? { job: plotFilter } : {},
      select: {
        id: true,
        status: true,
        dateOfOrder: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        leadTimeDays: true,
        orderItems: {
          select: {
            totalCost: true,
          },
        },
        supplier: {
          select: { id: true, name: true },
        },
        job: {
          select: {
            name: true,
            plot: {
              select: {
                site: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: plotFilter.plot
        ? { order: { job: plotFilter } }
        : {},
      select: {
        totalCost: true,
      },
    }),
  ]);

  const [contractors, events] = await Promise.all([
    prisma.jobContractor.findMany({
      where: plotFilter.plot ? { job: plotFilter } : {},
      select: {
        contact: {
          select: { id: true, name: true },
        },
        job: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            actualStartDate: true,
            actualEndDate: true,
          },
        },
      },
    }),
    prisma.eventLog.findMany({
      where: siteId ? { siteId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        type: true,
        createdAt: true,
      },
    }),
  ]);

  // Rained-off days + weather impact (separate small queries)
  const rainedOffDays = await prisma.rainedOffDay.findMany({
    where: siteId ? { siteId } : {},
    select: { siteId: true, date: true, type: true },
  });

  const weatherNotes = await prisma.jobAction.count({
    where: {
      action: "note",
      notes: { startsWith: "\u2614" },
      ...(plotFilter.plot ? { job: plotFilter } : {}),
    },
  });

  // ── Site Progress ──
  const siteProgress = sites.map((site) => {
    const totalPlots = site.plots.length;
    const totalJobs = site.plots.reduce((sum, p) => sum + p.jobs.length, 0);
    const completedJobs = site.plots.reduce(
      (sum, p) => sum + p.jobs.filter((j) => j.status === "COMPLETED").length,
      0
    );
    const avgBuildPercent =
      totalPlots > 0
        ? site.plots.reduce((sum, p) => sum + p.buildCompletePercent, 0) /
          totalPlots
        : 0;

    // Count delayed jobs (endDate < today and not completed)
    const now = getServerCurrentDate(req);
    const delayedJobs = site.plots.reduce(
      (sum, p) =>
        sum +
        p.jobs.filter(
          (j) =>
            j.status !== "COMPLETED" &&
            j.endDate &&
            new Date(j.endDate) < now
        ).length,
      0
    );

    return {
      siteId: site.id,
      siteName: site.name,
      status: site.status,
      totalPlots,
      totalJobs,
      completedJobs,
      avgBuildPercent: Math.round(avgBuildPercent),
      delayedJobs,
      onTrack: delayedJobs === 0,
    };
  });

  // ── Job Duration Analysis ──
  // Group by job name and compute planned vs actual durations
  const jobDurationMap = new Map<
    string,
    { planned: number[]; actual: number[]; count: number }
  >();

  for (const job of jobs) {
    if (!job.startDate || !job.endDate) continue;
    const plannedDays = differenceInDays(
      new Date(job.endDate),
      new Date(job.startDate)
    );

    const entry = jobDurationMap.get(job.name) || {
      planned: [],
      actual: [],
      count: 0,
    };
    entry.planned.push(plannedDays);
    entry.count++;

    if (job.actualStartDate && job.actualEndDate) {
      const actualDays = differenceInDays(
        new Date(job.actualEndDate),
        new Date(job.actualStartDate)
      );
      entry.actual.push(actualDays);
    }

    jobDurationMap.set(job.name, entry);
  }

  const jobDurations = Array.from(jobDurationMap.entries())
    .map(([name, data]) => ({
      jobName: name,
      avgPlannedDays: Math.round(
        data.planned.reduce((a, b) => a + b, 0) / data.planned.length
      ),
      avgActualDays:
        data.actual.length > 0
          ? Math.round(
              data.actual.reduce((a, b) => a + b, 0) / data.actual.length
            )
          : null,
      count: data.count,
    }))
    .filter((d) => d.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // ── Contractor Performance ──
  const contractorMap = new Map<
    string,
    {
      id: string;
      name: string;
      totalJobs: number;
      completedJobs: number;
      onTimeJobs: number;
      totalDelayDays: number;
    }
  >();

  for (const assignment of contractors) {
    const c = assignment.contact;
    const j = assignment.job;
    const entry = contractorMap.get(c.id) || {
      id: c.id,
      name: c.name,
      totalJobs: 0,
      completedJobs: 0,
      onTimeJobs: 0,
      totalDelayDays: 0,
    };

    entry.totalJobs++;

    if (j.status === "COMPLETED") {
      entry.completedJobs++;
      if (j.endDate && j.actualEndDate) {
        const delay = differenceInDays(
          new Date(j.actualEndDate),
          new Date(j.endDate)
        );
        if (delay <= 0) {
          entry.onTimeJobs++;
        } else {
          entry.totalDelayDays += delay;
        }
      } else {
        // No actual end date tracked, assume on time
        entry.onTimeJobs++;
      }
    }

    contractorMap.set(c.id, entry);
  }

  const contractorPerformance = Array.from(contractorMap.values())
    .map((c) => ({
      ...c,
      onTimeRate:
        c.completedJobs > 0
          ? Math.round((c.onTimeJobs / c.completedJobs) * 100)
          : null,
      avgDelayDays:
        c.completedJobs - c.onTimeJobs > 0
          ? Math.round(
              c.totalDelayDays / (c.completedJobs - c.onTimeJobs)
            )
          : 0,
    }))
    .sort((a, b) => b.totalJobs - a.totalJobs);

  // ── Order Metrics ──
  const ordersByStatus = {
    PENDING: 0,
    ORDERED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  let totalLeadTime = 0;
  let leadTimeCount = 0;
  let onTimeDeliveries = 0;
  let totalDeliveries = 0;

  const supplierSpendMap = new Map<
    string,
    { name: string; spend: number; orderCount: number }
  >();

  for (const order of orders) {
    const statusKey = order.status === "CONFIRMED" ? "ORDERED" : order.status;
    if (statusKey in ordersByStatus) ordersByStatus[statusKey as keyof typeof ordersByStatus]++;

    const orderSpend = order.orderItems.reduce(
      (sum, item) => sum + item.totalCost,
      0
    );

    if (order.supplier) {
      const existing = supplierSpendMap.get(order.supplier.id) || {
        name: order.supplier.name,
        spend: 0,
        orderCount: 0,
      };
      existing.spend += orderSpend;
      existing.orderCount++;
      supplierSpendMap.set(order.supplier.id, existing);
    }

    if (order.status === "DELIVERED" && order.deliveredDate) {
      totalDeliveries++;
      if (order.expectedDeliveryDate) {
        const deliveryDelay = differenceInDays(
          new Date(order.deliveredDate),
          new Date(order.expectedDeliveryDate)
        );
        if (deliveryDelay <= 0) onTimeDeliveries++;
      }
      if (order.dateOfOrder) {
        const lt = differenceInDays(
          new Date(order.deliveredDate),
          new Date(order.dateOfOrder)
        );
        totalLeadTime += lt;
        leadTimeCount++;
      }
    }
  }

  const totalSpend = orderItems.reduce(
    (sum, item) => sum + item.totalCost,
    0
  );

  const supplierSpend = Array.from(supplierSpendMap.values())
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  // ── Job Status Summary ──
  const jobStatusSummary = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
  };
  for (const job of jobs) {
    jobStatusSummary[job.status]++;
  }

  // ── Events over time (last 30 days grouped by day) ──
  const now = getServerCurrentDate(req);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const eventsByDay = new Map<string, number>();
  for (const event of events) {
    const day = new Date(event.createdAt).toISOString().split("T")[0];
    if (new Date(event.createdAt) >= thirtyDaysAgo) {
      eventsByDay.set(day, (eventsByDay.get(day) || 0) + 1);
    }
  }

  const activityTimeline = Array.from(eventsByDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    siteProgress,
    jobStatusSummary,
    jobDurations,
    contractorPerformance,
    orderMetrics: {
      ordersByStatus,
      totalSpend,
      avgLeadTimeDays:
        leadTimeCount > 0 ? Math.round(totalLeadTime / leadTimeCount) : null,
      onTimeDeliveryRate:
        totalDeliveries > 0
          ? Math.round((onTimeDeliveries / totalDeliveries) * 100)
          : null,
      totalOrders: orders.length,
      supplierSpend,
    },
    activityTimeline,
    summary: {
      totalSites: sites.length,
      totalPlots: plots,
      totalJobs: jobs.length,
      totalOrders: orders.length,
      totalSpend,
    },
    rainedOffStats: {
      totalDays: rainedOffDays.length,
      rainDays: rainedOffDays.filter((d) => d.type === "RAIN").length,
      temperatureDays: rainedOffDays.filter((d) => d.type === "TEMPERATURE").length,
      totalJobsAffected: weatherNotes,
      bySite: Object.entries(
        rainedOffDays.reduce<Record<string, number>>((acc, d) => {
          acc[d.siteId] = (acc[d.siteId] || 0) + 1;
          return acc;
        }, {})
      ).map(([sId, count]) => ({
        siteId: sId,
        siteName: sites.find((s) => s.id === sId)?.name ?? "Unknown",
        days: count,
      })),
    },
  });
}
