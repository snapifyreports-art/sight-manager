import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  differenceInDays,
  format,
} from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/weekly-report?weekOf=YYYY-MM-DD
// Generates a comprehensive weekly site report
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const weekParam = req.nextUrl.searchParams.get("weekOf");
  const targetDate = weekParam ? new Date(weekParam) : getServerCurrentDate(req);

  const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subWeeks(targetDate, 1), { weekStartsOn: 1 });
  const prevWeekEnd = endOfWeek(subWeeks(targetDate, 1), { weekStartsOn: 1 });
  const today = getServerCurrentDate(req);
  today.setHours(0, 0, 0, 0);

  // Batch queries in groups of 3 to respect Supabase pool limits
  const [site, allPlots, allJobs] = await Promise.all([
    prisma.site.findUnique({
      where: { id },
      select: { name: true, location: true, status: true },
    }),
    prisma.plot.count({ where: { siteId: id } }),
    prisma.job.findMany({
      where: { plot: { siteId: id } },
      select: { status: true, endDate: true },
    }),
  ]);

  const [jobsCompletedThisWeek, jobsCompletedLastWeek, jobsStartedThisWeek] = await Promise.all([
    prisma.job.count({
      where: {
        plot: { siteId: id },
        status: "COMPLETED",
        actualEndDate: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.job.count({
      where: {
        plot: { siteId: id },
        status: "COMPLETED",
        actualEndDate: { gte: prevWeekStart, lte: prevWeekEnd },
      },
    }),
    prisma.job.count({
      where: {
        plot: { siteId: id },
        actualStartDate: { gte: weekStart, lte: weekEnd },
      },
    }),
  ]);

  const [eventsThisWeek, rainedOffThisWeek, ordersPlacedThisWeek] = await Promise.all([
    prisma.eventLog.findMany({
      where: {
        siteId: id,
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      select: {
        type: true,
        description: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.rainedOffDay.findMany({
      where: {
        siteId: id,
        date: { gte: weekStart, lte: weekEnd },
      },
      select: { date: true, type: true, note: true },
    }),
    prisma.materialOrder.count({
      where: {
        job: { plot: { siteId: id } },
        dateOfOrder: { gte: weekStart, lte: weekEnd },
      },
    }),
  ]);

  const [deliveriesThisWeek, photosThisWeek, snagsOpenedThisWeek] = await Promise.all([
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        OR: [
          { deliveredDate: { gte: weekStart, lte: weekEnd } },
          {
            expectedDeliveryDate: { gte: weekStart, lte: weekEnd },
            status: "ORDERED",
          },
        ],
      },
      select: {
        id: true,
        itemsDescription: true,
        status: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        supplier: { select: { name: true } },
        job: {
          select: {
            name: true,
            plot: { select: { plotNumber: true, name: true } },
          },
        },
      },
    }),
    prisma.jobPhoto.count({
      where: {
        job: { plot: { siteId: id } },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.snag.count({
      where: {
        plot: { siteId: id },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
    }),
  ]);

  const [snagsResolvedThisWeek, totalOpenSnags] = await Promise.all([
    prisma.snag.count({
      where: {
        plot: { siteId: id },
        resolvedAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.snag.count({
      where: {
        plot: { siteId: id },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Calculate stats
  const totalJobs = allJobs.length;
  const completedJobs = allJobs.filter((j) => j.status === "COMPLETED").length;
  const overdueJobs = allJobs.filter(
    (j) => j.endDate && new Date(j.endDate) < today && j.status !== "COMPLETED"
  ).length;
  const activeJobs = allJobs.filter((j) => j.status === "IN_PROGRESS").length;

  // Next week lookahead
  const nextWeekStart = new Date(weekEnd.getTime() + 86400000);
  const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 });

  const jobsStartingNextWeek = await prisma.job.findMany({
    where: {
      plot: { siteId: id },
      startDate: { gte: nextWeekStart, lte: nextWeekEnd },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      plot: { select: { plotNumber: true, name: true } },
      assignedTo: { select: { name: true } },
    },
    take: 20,
  });

  const deliveriesNextWeek = await prisma.materialOrder.findMany({
    where: {
      job: { plot: { siteId: id } },
      expectedDeliveryDate: { gte: nextWeekStart, lte: nextWeekEnd },
      status: "ORDERED",
    },
    select: {
      itemsDescription: true,
      expectedDeliveryDate: true,
      supplier: { select: { name: true } },
      job: { select: { name: true, plot: { select: { plotNumber: true } } } },
    },
    take: 20,
  });

  return NextResponse.json({
    site,
    generatedAt: new Date().toISOString(),
    weekOf: format(weekStart, "yyyy-MM-dd"),
    weekLabel: `${format(weekStart, "dd MMM")} — ${format(weekEnd, "dd MMM yyyy")}`,

    overview: {
      totalPlots: allPlots,
      totalJobs,
      completedJobs,
      activeJobs,
      overdueJobs,
      progressPercent: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0,
    },

    thisWeek: {
      jobsStarted: jobsStartedThisWeek,
      jobsCompleted: jobsCompletedThisWeek,
      jobsCompletedLastWeek: jobsCompletedLastWeek,
      completionTrend:
        jobsCompletedThisWeek > jobsCompletedLastWeek
          ? "up"
          : jobsCompletedThisWeek < jobsCompletedLastWeek
            ? "down"
            : "flat",
      ordersPlaced: ordersPlacedThisWeek,
      photosUploaded: photosThisWeek,
      snagsOpened: snagsOpenedThisWeek,
      snagsResolved: snagsResolvedThisWeek,
      totalOpenSnags,
      rainedOffDays: rainedOffThisWeek.length,
      rainDays: rainedOffThisWeek.filter((r) => r.type === "RAIN").length,
      temperatureDays: rainedOffThisWeek.filter((r) => r.type === "TEMPERATURE").length,
      rainedOffDetails: rainedOffThisWeek.map((r) => ({
        date: r.date.toISOString(),
        type: r.type,
        note: r.note,
      })),
    },

    deliveries: deliveriesThisWeek.map((d) => ({
      id: d.id,
      items: d.itemsDescription,
      status: d.status,
      expectedDate: d.expectedDeliveryDate?.toISOString() ?? null,
      deliveredDate: d.deliveredDate?.toISOString() ?? null,
      supplier: d.supplier.name,
      job: d.job.name,
      plot: d.job.plot,
    })),

    activity: eventsThisWeek.map((e) => ({
      type: e.type,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
      user: e.user?.name ?? null,
    })),

    nextWeek: {
      jobsStarting: jobsStartingNextWeek.map((j) => ({
        id: j.id,
        name: j.name,
        startDate: j.startDate?.toISOString() ?? null,
        plot: j.plot,
        assignee: j.assignedTo?.name ?? null,
      })),
      deliveries: deliveriesNextWeek.map((d) => ({
        items: d.itemsDescription,
        expectedDate: d.expectedDeliveryDate?.toISOString() ?? null,
        supplier: d.supplier.name,
        plot: d.job.plot,
      })),
    },
  });
}
