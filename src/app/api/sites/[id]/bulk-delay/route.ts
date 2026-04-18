import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { getTodayWeatherSummary } from "@/lib/weather";
import { addWorkingDays } from "@/lib/working-days";

export const dynamic = "force-dynamic";

type DelayReasonType = "WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER";

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
  const { plotIds, days, reason, delayReasonType = "OTHER" } = body as {
    plotIds: string[];
    days: number;
    reason?: string;
    delayReasonType?: DelayReasonType;
  };

  if (!plotIds?.length || !days || days < 1) {
    return NextResponse.json(
      { error: "plotIds (non-empty) and days (>= 1) are required" },
      { status: 400 }
    );
  }

  // Fetch today's weather once to stamp on all delay notes
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { postcode: true } });
  const weatherSummary = site?.postcode
    ? await getTodayWeatherSummary(site.postcode).catch(() => null)
    : null;
  const weatherStamp = weatherSummary ? ` · ${weatherSummary}` : "";

  const reasonLabel =
    delayReasonType === "WEATHER_RAIN"
      ? "Weather – Rain"
      : delayReasonType === "WEATHER_TEMPERATURE"
        ? "Weather – Temperature"
        : reason || "No reason given";

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

    const newEndDate = addWorkingDays(currentJob.endDate, days);

    const allPlotJobs = await prisma.job.findMany({
      where: { plotId, status: { not: "ON_HOLD" } },
      orderBy: { sortOrder: "asc" },
    });

    const allOrders = await prisma.materialOrder.findMany({
      // Don't rewrite dates on already-delivered or cancelled orders — those are historical
      where: {
        jobId: { in: allPlotJobs.map((j) => j.id) },
        status: { notIn: ["CANCELLED", "DELIVERED"] },
      },
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

    await prisma.$transaction(async (tx) => {
      // Preserve original dates on first shift (only if not already set)
      const triggerData: Record<string, unknown> = { endDate: newEndDate };
      if (!currentJob.originalEndDate && currentJob.endDate) {
        triggerData.originalEndDate = currentJob.endDate;
      }
      if (currentJob.status === "NOT_STARTED" && currentJob.startDate) {
        triggerData.startDate = addWorkingDays(currentJob.startDate, days);
        if (!currentJob.originalStartDate) {
          triggerData.originalStartDate = currentJob.startDate;
        }
      }
      await tx.job.update({
        where: { id: currentJob.id },
        data: triggerData,
      });

      // Preserve originals on cascaded siblings too
      for (const update of cascade.jobUpdates) {
        const sibling = await tx.job.findUnique({
          where: { id: update.jobId },
          select: { startDate: true, endDate: true, originalStartDate: true, originalEndDate: true },
        });
        const siblingData: Record<string, unknown> = {
          startDate: update.newStart,
          endDate: update.newEnd,
        };
        if (sibling && !sibling.originalStartDate && sibling.startDate) {
          siblingData.originalStartDate = sibling.startDate;
        }
        if (sibling && !sibling.originalEndDate && sibling.endDate) {
          siblingData.originalEndDate = sibling.endDate;
        }
        await tx.job.update({
          where: { id: update.jobId },
          data: siblingData,
        });
      }

      for (const update of cascade.orderUpdates) {
        await tx.materialOrder.update({
          where: { id: update.orderId },
          data: {
            dateOfOrder: update.newOrderDate,
            expectedDeliveryDate: update.newDeliveryDate,
          },
        });
      }

      const noteEmoji =
        delayReasonType === "WEATHER_RAIN"
          ? "☔"
          : delayReasonType === "WEATHER_TEMPERATURE"
            ? "🌡️"
            : "⏳";
      const noteText = `${noteEmoji} Delayed ${days} day${days > 1 ? "s" : ""} — ${reasonLabel}${weatherStamp}`;

      await tx.jobAction.create({
        data: {
          jobId: currentJob.id,
          action: "note",
          notes: noteText,
          userId: session.user.id,
        },
      });

      await tx.eventLog.create({
        data: {
          type: "SCHEDULE_CASCADED",
          description: `Bulk delay: "${currentJob.name}" on plot ${currentJob.plot.plotNumber || plotId} delayed ${days} day(s) — ${reasonLabel}${weatherStamp}`,
          siteId,
          plotId,
          jobId: currentJob.id,
          userId: session.user.id,
          delayReasonType,
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
