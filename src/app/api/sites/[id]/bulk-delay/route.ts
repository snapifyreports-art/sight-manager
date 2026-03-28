import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

// POST /api/sites/[id]/bulk-delay — delay the current job on multiple plots
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;
  const body = await req.json();
  const { plotIds, days, reason } = body as {
    plotIds: string[];
    days: number;
    reason?: string;
  };

  if (!plotIds?.length || !days || days < 1) {
    return NextResponse.json(
      { error: "plotIds (non-empty) and days (>= 1) are required" },
      { status: 400 }
    );
  }

  const results: Array<{
    plotId: string;
    plotNumber: string | null;
    jobName: string;
    deltaDays: number;
    jobsShifted: number;
    ordersShifted: number;
  }> = [];
  const skipped: string[] = [];

  // Process plots sequentially to respect connection pool limits
  for (const plotId of plotIds) {
    // Find the current active job for this plot
    const currentJob = await prisma.job.findFirst({
      where: {
        plotId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        endDate: { not: null },
      },
      orderBy: { sortOrder: "asc" },
      include: { plot: { select: { plotNumber: true } } },
    });

    if (!currentJob || !currentJob.endDate) {
      skipped.push(plotId);
      continue;
    }

    const newEndDate = addDays(currentJob.endDate, days);

    // Get all jobs on this plot for cascade calculation
    const allPlotJobs = await prisma.job.findMany({
      where: { plotId },
      orderBy: { sortOrder: "asc" },
    });

    const allOrders = await prisma.materialOrder.findMany({
      where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
    });

    const cascade = calculateCascade(
      currentJob.id,
      newEndDate,
      allPlotJobs.map((j) => ({
        id: j.id,
        name: j.name,
        startDate: j.startDate,
        endDate: j.endDate,
        sortOrder: j.sortOrder,
      })),
      allOrders.map((o) => ({
        id: o.id,
        jobId: o.jobId,
        dateOfOrder: o.dateOfOrder,
        expectedDeliveryDate: o.expectedDeliveryDate,
      }))
    );

    // Apply in transaction
    await prisma.$transaction(async (tx) => {
      // Update the current job's end date
      await tx.job.update({
        where: { id: currentJob.id },
        data: { endDate: newEndDate },
      });

      // Also shift start date if job hasn't started
      if (currentJob.status === "NOT_STARTED" && currentJob.startDate) {
        await tx.job.update({
          where: { id: currentJob.id },
          data: { startDate: addDays(currentJob.startDate, days) },
        });
      }

      // Update subsequent jobs
      for (const update of cascade.jobUpdates) {
        await tx.job.update({
          where: { id: update.jobId },
          data: { startDate: update.newStart, endDate: update.newEnd },
        });
      }

      // Update orders
      for (const update of cascade.orderUpdates) {
        await tx.materialOrder.update({
          where: { id: update.orderId },
          data: {
            dateOfOrder: update.newOrderDate,
            expectedDeliveryDate: update.newDeliveryDate,
          },
        });
      }

      // Add note to the job
      const noteText = `⏳ Delayed ${days} day${days > 1 ? "s" : ""}${reason ? ` — ${reason}` : ""}`;
      await tx.jobAction.create({
        data: {
          jobId: currentJob.id,
          action: "note",
          notes: noteText,
          userId: session.user.id,
        },
      });

      // Log event
      await tx.eventLog.create({
        data: {
          type: "SCHEDULE_CASCADED",
          description: `Bulk delay: "${currentJob.name}" on plot ${currentJob.plot.plotNumber || plotId} delayed ${days} day(s)${reason ? ` — ${reason}` : ""}`,
          siteId,
          plotId,
          jobId: currentJob.id,
          userId: session.user.id,
        },
      });
    });

    results.push({
      plotId,
      plotNumber: currentJob.plot.plotNumber,
      jobName: currentJob.name,
      deltaDays: days,
      jobsShifted: cascade.jobUpdates.length,
      ordersShifted: cascade.orderUpdates.length,
    });
  }

  return NextResponse.json({
    updated: results.length,
    skipped: skipped.length,
    details: results,
  });
}
