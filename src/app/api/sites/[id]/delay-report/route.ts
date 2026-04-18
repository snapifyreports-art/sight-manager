import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/delay-report
// Returns overdue/delayed jobs with justifications, weather impact days, delivery delays
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const today = getServerCurrentDate(req);
  today.setHours(0, 0, 0, 0);

  const [overdueJobs, weatherImpactDays, overdueDeliveries, completedLateJobs] =
    await Promise.all([
      // Currently overdue jobs — leaf jobs only (parents are derived rollups)
      prisma.job.findMany({
        where: {
          plot: { siteId: id },
          endDate: { lt: today },
          status: { not: "COMPLETED" },
          children: { none: {} },
        },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          weatherAffected: true,
          description: true,
          plot: { select: { plotNumber: true, name: true } },
          assignedTo: { select: { name: true } },
          contractors: {
            include: {
              contact: { select: { name: true, company: true } },
            },
          },
          orders: {
            where: {
              OR: [
                {
                  deliveredDate: { not: null },
                  expectedDeliveryDate: { not: null },
                },
                {
                  deliveredDate: null,
                  expectedDeliveryDate: { lt: today },
                  status: "ORDERED",
                },
              ],
            },
            select: {
              id: true,
              itemsDescription: true,
              expectedDeliveryDate: true,
              deliveredDate: true,
              status: true,
              supplier: { select: { name: true } },
            },
          },
          // Most recent delay event with a reason type
          events: {
            where: { type: "SCHEDULE_CASCADED", delayReasonType: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { delayReasonType: true },
          },
        },
        orderBy: { endDate: "asc" },
      }),

      // All weather impact days for this site (rain + temperature)
      prisma.rainedOffDay.findMany({
        where: { siteId: id },
        select: { date: true, type: true, note: true },
        orderBy: { date: "desc" },
      }),

      // All overdue deliveries site-wide
      prisma.materialOrder.findMany({
        where: {
          job: { plot: { siteId: id } },
          expectedDeliveryDate: { lt: today },
          status: "ORDERED",
          deliveredDate: null,
        },
        select: {
          id: true,
          itemsDescription: true,
          expectedDeliveryDate: true,
          status: true,
          supplier: { select: { name: true } },
          job: {
            select: {
              name: true,
              plot: { select: { plotNumber: true, name: true } },
            },
          },
        },
        orderBy: { expectedDeliveryDate: "asc" },
      }),

      // Jobs completed late (for trend) — leaves only, parents don't have actualEndDate anyway
      prisma.job.findMany({
        where: {
          plot: { siteId: id },
          status: "COMPLETED",
          endDate: { not: null },
          actualEndDate: { not: null },
          children: { none: {} },
        },
        select: {
          id: true,
          name: true,
          endDate: true,
          actualEndDate: true,
          plot: { select: { plotNumber: true } },
        },
      }),
    ]);

  const rainDays = weatherImpactDays.filter((d) => d.type === "RAIN");
  const temperatureDays = weatherImpactDays.filter((d) => d.type === "TEMPERATURE");

  // Calculate delay details per job
  const delayedJobs = overdueJobs.map((job) => {
    const daysOverdue = job.endDate ? differenceInDays(today, job.endDate) : 0;

    // Count weather impact days overlapping this job's scheduled period
    const jobRainDays = job.startDate && job.endDate
      ? rainDays.filter((r) => {
          const rd = new Date(r.date);
          return rd >= job.startDate! && rd <= today;
        }).length
      : 0;

    const jobTempDays = job.startDate && job.endDate
      ? temperatureDays.filter((r) => {
          const rd = new Date(r.date);
          return rd >= job.startDate! && rd <= today;
        }).length
      : 0;

    // Explicit reason from the most recent delay event (takes priority)
    const explicitReason = job.events?.[0]?.delayReasonType ?? null;

    // Determine if weather-excused: either explicitly recorded as weather delay,
    // or weather-affected job with overlapping weather impact days (inferred)
    const isWeatherExcused =
      explicitReason === "WEATHER_RAIN" ||
      explicitReason === "WEATHER_TEMPERATURE" ||
      (explicitReason === null && job.weatherAffected && (jobRainDays > 0 || jobTempDays > 0));

    const weatherReasonType =
      explicitReason === "WEATHER_RAIN"
        ? "RAIN"
        : explicitReason === "WEATHER_TEMPERATURE"
          ? "TEMPERATURE"
          : jobRainDays > 0
            ? "RAIN"
            : jobTempDays > 0
              ? "TEMPERATURE"
              : null;

    // Build causes list
    const causes: string[] = [];
    if (isWeatherExcused) {
      if (weatherReasonType === "RAIN")
        causes.push(`Weather – Rain (${jobRainDays} impact day${jobRainDays !== 1 ? "s" : ""})`);
      else if (weatherReasonType === "TEMPERATURE")
        causes.push(`Weather – Temperature (${jobTempDays} impact day${jobTempDays !== 1 ? "s" : ""})`);
      else causes.push("Weather");
    }
    if (job.orders.length > 0) {
      const lateOrders = job.orders.filter((o) => {
        if (o.deliveredDate && o.expectedDeliveryDate) {
          return new Date(o.deliveredDate) > new Date(o.expectedDeliveryDate);
        }
        return (
          o.status !== "DELIVERED" &&
          o.expectedDeliveryDate &&
          new Date(o.expectedDeliveryDate) < today
        );
      });
      if (lateOrders.length > 0) {
        causes.push(
          `Material delays (${lateOrders.length} late order${lateOrders.length > 1 ? "s" : ""})`
        );
      }
    }
    if (!isWeatherExcused && causes.length === 0) {
      causes.push(explicitReason === "OTHER" ? "Other (documented)" : "No documented cause");
    }

    return {
      id: job.id,
      name: job.name,
      status: job.status,
      startDate: job.startDate?.toISOString() ?? null,
      endDate: job.endDate?.toISOString() ?? null,
      daysOverdue,
      weatherAffected: job.weatherAffected,
      rainDaysImpact: jobRainDays,
      temperatureDaysImpact: jobTempDays,
      isWeatherExcused,
      weatherReasonType,
      explicitReason,
      causes,
      plot: job.plot,
      assignedTo: job.assignedTo?.name ?? null,
      contractor:
        job.contractors[0]?.contact?.company ??
        job.contractors[0]?.contact?.name ??
        null,
      lateOrders: job.orders
        .filter((o) => {
          if (o.deliveredDate && o.expectedDeliveryDate) {
            return new Date(o.deliveredDate) > new Date(o.expectedDeliveryDate);
          }
          return (
            o.expectedDeliveryDate &&
            new Date(o.expectedDeliveryDate) < today
          );
        })
        .map((o) => ({
          id: o.id,
          items: o.itemsDescription,
          supplier: o.supplier.name,
          expectedDate: o.expectedDeliveryDate?.toISOString() ?? null,
          deliveredDate: o.deliveredDate?.toISOString() ?? null,
          daysLate: o.expectedDeliveryDate
            ? differenceInDays(
                o.deliveredDate ? new Date(o.deliveredDate) : today,
                new Date(o.expectedDeliveryDate)
              )
            : 0,
        })),
    };
  });

  // Completed-late trend
  const completedLateTrend = completedLateJobs
    .filter((j) => j.actualEndDate! > j.endDate!)
    .map((j) => ({
      id: j.id,
      name: j.name,
      plotNumber: j.plot.plotNumber,
      scheduledEnd: j.endDate!.toISOString(),
      actualEnd: j.actualEndDate!.toISOString(),
      daysLate: differenceInDays(j.actualEndDate!, j.endDate!),
    }));

  const weatherExcusedJobs = delayedJobs.filter((j) => j.isWeatherExcused);
  const weatherRainDelays = delayedJobs.filter((j) => j.weatherReasonType === "RAIN").length;
  const weatherTempDelays = delayedJobs.filter((j) => j.weatherReasonType === "TEMPERATURE").length;
  const nonWeatherDelays = delayedJobs.filter((j) => !j.isWeatherExcused).length;

  return NextResponse.json({
    siteId: id,
    generatedAt: new Date().toISOString(),
    totalWeatherImpactDays: weatherImpactDays.length,
    totalRainDays: rainDays.length,
    totalTemperatureDays: temperatureDays.length,
    // Legacy field name kept for backwards compat
    totalRainedOffDays: weatherImpactDays.length,
    rainedOffDays: weatherImpactDays.map((r) => ({
      date: r.date.toISOString(),
      type: r.type,
      note: r.note,
    })),
    delayedJobs,
    overdueDeliveries: overdueDeliveries.map((d) => ({
      id: d.id,
      items: d.itemsDescription,
      supplier: d.supplier.name,
      expectedDate: d.expectedDeliveryDate?.toISOString() ?? null,
      job: d.job.name,
      plot: d.job.plot,
      daysOverdue: d.expectedDeliveryDate
        ? differenceInDays(today, new Date(d.expectedDeliveryDate))
        : 0,
    })),
    completedLateTrend,
    summary: {
      currentlyOverdueJobs: delayedJobs.length,
      weatherExcusedDelays: weatherExcusedJobs.length,
      weatherRainDelays,
      weatherTempDelays,
      nonWeatherDelays,
      materialRelatedDelays: delayedJobs.filter((j) =>
        j.causes.some((c) => c.startsWith("Material"))
      ).length,
      overdueDeliveryCount: overdueDeliveries.length,
      completedLateCount: completedLateTrend.length,
      // Legacy
      weatherRelatedDelays: weatherExcusedJobs.length,
    },
  });
}
