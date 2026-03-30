import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { addDays, addWeeks, differenceInCalendarDays } from "date-fns";
import { getNextMonday } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * POST /api/plots/[id]/restart-decision
 * Handle the post-completion decision for the next job on a plot.
 *
 * Body:
 *   decision: "start_today" | "start_next_monday" | "push_weeks" | "leave_for_now"
 *   nextJobId: string (required unless leave_for_now)
 *   pushWeeks?: number  (required for push_weeks)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: plotId } = await params;
  const body = await req.json();
  const { decision, nextJobId, pushWeeks } = body as {
    decision: "start_today" | "start_next_monday" | "push_weeks" | "leave_for_now";
    nextJobId?: string;
    pushWeeks?: number;
  };

  const now = getServerCurrentDate(req);

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { id: true, plotNumber: true, siteId: true },
  });
  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // "Leave for now" — mark plot as awaiting restart, no date changes
  if (decision === "leave_for_now") {
    await prisma.plot.update({
      where: { id: plotId },
      data: { awaitingRestart: true },
    });

    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Plot ${plot.plotNumber || plotId}: next job deferred — awaiting restart decision`,
        siteId: plot.siteId,
        plotId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, decision });
  }

  if (!nextJobId) {
    return NextResponse.json({ error: "nextJobId is required" }, { status: 400 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId },
    orderBy: { sortOrder: "asc" },
  });

  const nextJob = allPlotJobs.find((j) => j.id === nextJobId);
  if (!nextJob) {
    return NextResponse.json({ error: "Next job not found" }, { status: 404 });
  }

  // Calculate target start date
  let targetStart: Date;
  if (decision === "start_today") {
    targetStart = new Date(now);
    targetStart.setHours(0, 0, 0, 0);
  } else if (decision === "start_next_monday") {
    targetStart = getNextMonday(now);
  } else if (decision === "push_weeks") {
    const base = nextJob.startDate || now;
    targetStart = addWeeks(base, pushWeeks ?? 1);
  } else {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  // Preserve job duration
  const durationDays =
    nextJob.startDate && nextJob.endDate
      ? Math.max(1, differenceInCalendarDays(nextJob.endDate, nextJob.startDate))
      : 7;

  const targetEnd = addDays(targetStart, durationDays);

  // Delta to apply to all subsequent jobs
  const delta = nextJob.startDate
    ? differenceInCalendarDays(targetStart, nextJob.startDate)
    : 0;

  await prisma.$transaction(async (tx) => {
    // Update next job dates
    await tx.job.update({
      where: { id: nextJobId },
      data: { startDate: targetStart, endDate: targetEnd },
    });

    // Shift all subsequent jobs by the same delta
    if (delta !== 0) {
      const subsequent = allPlotJobs.filter((j) => j.sortOrder > nextJob.sortOrder);
      for (const job of subsequent) {
        if (!job.startDate || !job.endDate) continue;
        await tx.job.update({
          where: { id: job.id },
          data: {
            startDate: addDays(job.startDate, delta),
            endDate: addDays(job.endDate, delta),
          },
        });
      }

      // Shift pending/ordered material orders on shifted jobs
      const shiftedJobIds = subsequent.map((j) => j.id).concat(nextJobId);
      const orders = await tx.materialOrder.findMany({
        where: { jobId: { in: shiftedJobIds }, status: { in: ["PENDING", "ORDERED"] } },
      });
      for (const order of orders) {
        await tx.materialOrder.update({
          where: { id: order.id },
          data: {
            dateOfOrder: order.dateOfOrder ? addDays(order.dateOfOrder, delta) : undefined,
            expectedDeliveryDate: order.expectedDeliveryDate
              ? addDays(order.expectedDeliveryDate, delta)
              : undefined,
          },
        });
      }
    }

    // If starting today: mark job as IN_PROGRESS
    if (decision === "start_today") {
      await tx.job.update({
        where: { id: nextJobId },
        data: { status: "IN_PROGRESS", actualStartDate: now },
      });
    }

    // Log event
    const descMap = {
      start_today: "started today (pulled forward)",
      start_next_monday: "scheduled for next Monday",
      push_weeks: `pushed forward ${pushWeeks ?? 1} week(s)`,
    };
    await tx.eventLog.create({
      data: {
        type: decision === "start_today" ? "JOB_STARTED" : "SCHEDULE_CASCADED",
        description: `Plot ${plot.plotNumber || plotId}: "${nextJob.name}" ${descMap[decision]}${delta !== 0 ? `, ${Math.abs(delta)}d ${delta < 0 ? "pulled forward" : "pushed back"}` : ""}`,
        siteId: plot.siteId,
        plotId,
        jobId: nextJobId,
        userId: session.user.id,
      },
    });

    // Clear awaitingRestart
    await tx.plot.update({
      where: { id: plotId },
      data: { awaitingRestart: false },
    });
  });

  return NextResponse.json({ success: true, decision, delta, targetStart });
}
