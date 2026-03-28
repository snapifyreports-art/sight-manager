import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { fetchWeatherForPostcode } from "@/lib/weather";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/daily-brief?date=YYYY-MM-DD
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const dateParam = req.nextUrl.searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : getServerCurrentDate(req);
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Batch 1
  const [site, jobsStartingToday, jobsDueToday] = await Promise.all([
    prisma.site.findUnique({
      where: { id },
      select: { id: true, name: true, location: true, postcode: true, status: true },
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        startDate: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true, name: true, status: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          include: { contact: { select: { name: true, company: true } } },
        },
      },
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        endDate: { gte: dayStart, lte: dayEnd },
        status: { not: "COMPLETED" },
      },
      select: {
        id: true, name: true, status: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Fetch weather in background (HTTP call, doesn't count against Supabase pool)
  const weatherPromise = site.postcode
    ? fetchWeatherForPostcode(site.postcode)
    : Promise.resolve(null);

  // Batch 2
  const [overdueJobs, activeJobs, deliveriesToday] = await Promise.all([
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        endDate: { lt: dayStart },
        status: { not: "COMPLETED" },
      },
      select: {
        id: true, name: true, status: true, endDate: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    prisma.job.findMany({
      where: { plot: { siteId: id }, status: "IN_PROGRESS" },
      select: {
        id: true, name: true, endDate: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        expectedDeliveryDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["ORDERED", "CONFIRMED"] },
      },
      select: {
        id: true, itemsDescription: true, status: true,
        supplier: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
    }),
  ]);

  // Batch 3
  const tomorrowStart = startOfDay(addDays(targetDate, 1));
  const tomorrowEnd = endOfDay(addDays(targetDate, 1));

  const [overdueDeliveries, openSnags, openSnagsList, rainedOff, outstandingOrders, jobsStartingTomorrow] = await Promise.all([
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        expectedDeliveryDate: { lt: dayStart },
        status: { in: ["ORDERED", "CONFIRMED"] },
      },
      select: {
        id: true, itemsDescription: true, expectedDeliveryDate: true,
        supplier: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
    }),
    prisma.snag.count({
      where: { plot: { siteId: id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.snag.findMany({
      where: { plot: { siteId: id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: {
        id: true, description: true, status: true, priority: true, location: true,
        plotId: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
        assignedTo: { select: { name: true } },
        contact: { select: { name: true, company: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 20,
    }),
    prisma.rainedOffDay.findFirst({
      where: { siteId: id, date: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: "PENDING",
      },
      select: {
        id: true, itemsDescription: true, status: true, expectedDeliveryDate: true,
        supplier: { select: { id: true, name: true, contactEmail: true, contactName: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
      orderBy: { dateOfOrder: "asc" },
      take: 30,
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        startDate: { gte: tomorrowStart, lte: tomorrowEnd },
      },
      select: {
        id: true, name: true, status: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: { include: { contact: { select: { name: true, company: true } } } },
      },
    }),
  ]);

  // Batch 4
  const [recentEvents, totalPlots, allJobs] = await Promise.all([
    prisma.eventLog.findMany({
      where: { siteId: id, createdAt: { gte: subDays(dayStart, 1), lte: dayEnd } },
      select: {
        id: true, type: true, description: true, createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.plot.count({ where: { siteId: id } }),
    prisma.job.count({ where: { plot: { siteId: id } } }),
  ]);

  const [completedJobs, weatherForecast] = await Promise.all([
    prisma.job.count({
      where: { plot: { siteId: id }, status: "COMPLETED" },
    }),
    weatherPromise,
  ]);

  // Build weather response: today + next 3 days
  let weather = null;
  if (weatherForecast && weatherForecast.length > 0) {
    weather = {
      today: weatherForecast[0],
      forecast: weatherForecast.slice(1, 4),
    };
  }

  return NextResponse.json({
    site,
    date: dayStart.toISOString(),
    isRainedOff: !!rainedOff,
    rainedOffNote: rainedOff?.note ?? null,
    summary: {
      totalPlots,
      totalJobs: allJobs,
      completedJobs,
      progressPercent: allJobs > 0 ? Math.round((completedJobs / allJobs) * 100) : 0,
      activeJobCount: activeJobs.length,
      overdueJobCount: overdueJobs.length,
      openSnagCount: openSnags,
    },
    jobsStartingToday,
    jobsStartingTomorrow,
    jobsDueToday,
    overdueJobs: overdueJobs.map((j) => ({
      ...j,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    activeJobs: activeJobs.map((j) => ({
      ...j,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    deliveriesToday,
    overdueDeliveries: overdueDeliveries.map((d) => ({
      ...d,
      expectedDeliveryDate: d.expectedDeliveryDate?.toISOString() ?? null,
    })),
    openSnagsList,
    ordersToPlace: outstandingOrders.map((o) => ({
      ...o,
      expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
    })),
    recentEvents: recentEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    weather,
  });
}
