import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { differenceInDays, differenceInBusinessDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";

// GET /api/sites/[id]/delay-report
// Returns overdue/delayed jobs with justifications, rained-off days impact, delivery delays
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const today = getServerCurrentDate(req);
  today.setHours(0, 0, 0, 0);

  const [overdueJobs, rainedOffDays, overdueDeliveries, completedLateJobs] =
    await Promise.all([
      // Currently overdue jobs
      prisma.job.findMany({
        where: {
          plot: { siteId: id },
          endDate: { lt: today },
          status: { not: "COMPLETED" },
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
                // Deliveries that were late
                {
                  deliveredDate: { not: null },
                  expectedDeliveryDate: { not: null },
                },
                // Deliveries still pending past expected date
                {
                  deliveredDate: null,
                  expectedDeliveryDate: { lt: today },
                  status: { in: ["ORDERED", "CONFIRMED"] },
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
        },
        orderBy: { endDate: "asc" },
      }),

      // All rained-off days for this site
      prisma.rainedOffDay.findMany({
        where: { siteId: id },
        select: {
          date: true,
          note: true,
        },
        orderBy: { date: "desc" },
      }),

      // All overdue deliveries site-wide
      prisma.materialOrder.findMany({
        where: {
          job: { plot: { siteId: id } },
          expectedDeliveryDate: { lt: today },
          status: { in: ["ORDERED", "CONFIRMED"] },
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

      // Jobs completed late (for trend)
      prisma.job.findMany({
        where: {
          plot: { siteId: id },
          status: "COMPLETED",
          endDate: { not: null },
          actualEndDate: { not: null },
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

  // Calculate delay details
  const delayedJobs = overdueJobs.map((job) => {
    const daysOverdue = job.endDate
      ? differenceInDays(today, job.endDate)
      : 0;

    // Count rained-off days during the job's scheduled period
    const jobRainDays = job.startDate && job.endDate
      ? rainedOffDays.filter((r) => {
          const rd = new Date(r.date);
          return rd >= job.startDate! && rd <= today;
        }).length
      : 0;

    // Identify delay causes
    const causes: string[] = [];
    if (job.weatherAffected && jobRainDays > 0) {
      causes.push(`Weather (${jobRainDays} rained-off day${jobRainDays > 1 ? "s" : ""})`);
    }
    if (job.orders.length > 0) {
      const lateOrders = job.orders.filter((o) => {
        if (o.deliveredDate && o.expectedDeliveryDate) {
          return new Date(o.deliveredDate) > new Date(o.expectedDeliveryDate);
        }
        return o.status !== "DELIVERED" && o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < today;
      });
      if (lateOrders.length > 0) {
        causes.push(`Material delays (${lateOrders.length} late order${lateOrders.length > 1 ? "s" : ""})`);
      }
    }
    if (causes.length === 0) {
      causes.push("No documented cause");
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
      causes,
      plot: job.plot,
      assignedTo: job.assignedTo?.name ?? null,
      contractor: job.contractors[0]?.contact?.company ?? job.contractors[0]?.contact?.name ?? null,
      lateOrders: job.orders
        .filter((o) => {
          if (o.deliveredDate && o.expectedDeliveryDate) {
            return new Date(o.deliveredDate) > new Date(o.expectedDeliveryDate);
          }
          return o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < today;
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

  return NextResponse.json({
    siteId: id,
    generatedAt: new Date().toISOString(),
    totalRainedOffDays: rainedOffDays.length,
    rainedOffDays: rainedOffDays.map((r) => ({
      date: r.date.toISOString(),
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
      weatherRelatedDelays: delayedJobs.filter((j) => j.weatherAffected).length,
      materialRelatedDelays: delayedJobs.filter((j) =>
        j.causes.some((c) => c.startsWith("Material"))
      ).length,
      overdueDeliveryCount: overdueDeliveries.length,
      completedLateCount: completedLateTrend.length,
    },
  });
}
