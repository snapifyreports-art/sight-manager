import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { getTodayWeatherSummary } from "@/lib/weather";
import { addWorkingDays } from "@/lib/working-days";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
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

  try {
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
        status: j.status,
      })),
      allOrders.map((o) => ({
        id: o.id,
        jobId: o.jobId,
        dateOfOrder: o.dateOfOrder,
        expectedDeliveryDate: o.expectedDeliveryDate,
        status: o.status,
      }))
    );

    await prisma.$transaction(async (tx) => {
      // The cascade library returns the trigger + downstream uniformly.
      // Apply them all the same way; set originalStart/End on first shift.
      for (const update of cascade.jobUpdates) {
        const current = await tx.job.findUnique({
          where: { id: update.jobId },
          select: { startDate: true, endDate: true, originalStartDate: true, originalEndDate: true },
        });
        const data: Record<string, unknown> = {
          startDate: update.newStart,
          endDate: update.newEnd,
        };
        if (current && !current.originalStartDate && current.startDate) {
          data.originalStartDate = current.startDate;
        }
        if (current && !current.originalEndDate && current.endDate) {
          data.originalEndDate = current.endDate;
        }
        await tx.job.update({
          where: { id: update.jobId },
          data,
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

      // Recompute parents of any shifted child jobs on this plot
      // (cascade.jobUpdates already includes the trigger)
      const { recomputeParentFromChildren } = await import("@/lib/parent-job");
      const parentIds = new Set<string>();
      for (const update of cascade.jobUpdates) {
        const shiftedJob = await tx.job.findUnique({
          where: { id: update.jobId },
          select: { parentId: true },
        });
        if (shiftedJob?.parentId) parentIds.add(shiftedJob.parentId);
      }
      for (const parentId of parentIds) {
        await recomputeParentFromChildren(tx, parentId);
      }
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
  } catch (err) {
    return apiError(err, "Failed to apply bulk delay");
  }
}
