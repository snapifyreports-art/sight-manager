import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { addWeeks } from "date-fns";
import { addWorkingDays, differenceInWorkingDays, snapToWorkingDay } from "@/lib/working-days";
import { getNextMonday } from "@/lib/schedule";
import { apiError } from "@/lib/api-errors";

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
  const { decision, nextJobId, pushWeeks, awaitingContractor } = body as {
    decision: "start_today" | "start_next_monday" | "push_weeks" | "leave_for_now";
    nextJobId?: string;
    pushWeeks?: number;
    awaitingContractor?: boolean;
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
    try {
      await prisma.plot.update({
        where: { id: plotId },
        data: {
          awaitingRestart: true,
          ...(awaitingContractor ? { awaitingContractorConfirmation: true } : {}),
        },
      });

      await prisma.eventLog.create({
        data: {
          type: "USER_ACTION",
          description: awaitingContractor
            ? `Plot ${plot.plotNumber || plotId}: awaiting contractor confirmation`
            : `Plot ${plot.plotNumber || plotId}: next job deferred — awaiting restart decision`,
          siteId: plot.siteId,
          plotId,
          userId: session.user.id,
        },
      });

      return NextResponse.json({ success: true, decision });
    } catch (err) {
      return apiError(err, "Failed to apply restart decision");
    }
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

  // Snap target start to working day BEFORE measuring delta — otherwise
  // a Sun→Mon snap added phantom days to the cascade.
  targetStart = snapToWorkingDay(targetStart, "forward");

  // Preserve job duration in WORKING days (canonical unit across the
  // app — see docs/cascade-spec.md). Previously this used
  // differenceInCalendarDays, which silently changed the working-day
  // count when the shift crossed weekends asymmetrically (e.g. a
  // 10-WD job stored as Mon→Fri = 11 calendar days; if we shifted
  // start to Wed, end would land on Sun, and the working-day count
  // would silently collapse to 8).
  const nextJobDurationWD =
    nextJob.startDate && nextJob.endDate
      ? Math.max(1, differenceInWorkingDays(nextJob.endDate, nextJob.startDate))
      : 5;

  const targetEnd = addWorkingDays(targetStart, nextJobDurationWD);

  // Delta to apply to all subsequent jobs — also in working days, so
  // it matches `addWorkingDays(...)` calls below.
  const delta = nextJob.startDate
    ? differenceInWorkingDays(targetStart, nextJob.startDate)
    : 0;

  try {
  await prisma.$transaction(async (tx) => {
    // Preserve original dates before any shift
    if (!nextJob.originalStartDate && nextJob.startDate) {
      await tx.job.update({
        where: { id: nextJobId },
        data: { originalStartDate: nextJob.startDate, originalEndDate: nextJob.endDate },
      });
    }

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
        // Preserve original dates on first shift
        const preserveOriginals: Record<string, unknown> = {};
        if (!job.originalStartDate) {
          preserveOriginals.originalStartDate = job.startDate;
          preserveOriginals.originalEndDate = job.endDate;
        }
        // Working-day cascade: shift start by delta WD, preserve the
        // job's working-day duration (not calendar — see comment up
        // top). Result is always on a working day by construction.
        const newJobStart = snapToWorkingDay(addWorkingDays(job.startDate, delta), "forward");
        const jobDurationWD = Math.max(
          1,
          differenceInWorkingDays(job.endDate, job.startDate),
        );
        const newJobEnd = addWorkingDays(newJobStart, jobDurationWD);
        await tx.job.update({
          where: { id: job.id },
          data: {
            startDate: newJobStart,
            endDate: newJobEnd,
            ...preserveOriginals,
          },
        });
      }

      // Shift pending/ordered material orders on shifted jobs (exclude CANCELLED)
      const shiftedJobIds = subsequent.map((j) => j.id).concat(nextJobId);
      const orders = await tx.materialOrder.findMany({
        where: { jobId: { in: shiftedJobIds }, status: { in: ["PENDING", "ORDERED"] } },
      });
      for (const order of orders) {
        await tx.materialOrder.update({
          where: { id: order.id },
          data: {
            dateOfOrder: order.dateOfOrder ? snapToWorkingDay(addWorkingDays(order.dateOfOrder, delta), "back") : undefined,
            expectedDeliveryDate: order.expectedDeliveryDate
              ? snapToWorkingDay(addWorkingDays(order.expectedDeliveryDate, delta), "back")
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

    // Clear awaitingRestart and contractor confirmation
    await tx.plot.update({
      where: { id: plotId },
      data: { awaitingRestart: false, awaitingContractorConfirmation: false },
    });
  });

  return NextResponse.json({ success: true, decision, delta, targetStart });
  } catch (err) {
    return apiError(err, "Failed to apply restart decision");
  }
}
