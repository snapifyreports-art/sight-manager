import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { addWorkingDays, snapToWorkingDay } from "@/lib/working-days";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// POST /api/jobs/[id]/cascade — preview cascade effects
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { newEndDate } = body;

  if (!newEndDate) {
    return NextResponse.json(
      { error: "newEndDate is required" },
      { status: 400 }
    );
  }

  // Get the job and all sibling jobs on the same plot
  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: {
      plotId: job.plotId,
      status: { not: "ON_HOLD" },
    },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: {
      jobId: { in: allPlotJobs.map((j) => j.id) },
      status: { not: "CANCELLED" },
    },
  });

  const result = calculateCascade(
    id,
    new Date(newEndDate),
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

  return NextResponse.json({
    preview: true,
    ...JSON.parse(JSON.stringify(result)),
  });
}

// PUT /api/jobs/[id]/cascade — apply cascade
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { newEndDate, confirm } = body;

  if (!newEndDate || !confirm) {
    return NextResponse.json(
      { error: "newEndDate and confirm: true are required" },
      { status: 400 }
    );
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: {
      plotId: job.plotId,
      status: { not: "ON_HOLD" },
    },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: {
      jobId: { in: allPlotJobs.map((j) => j.id) },
      status: { not: "CANCELLED" },
    },
  });

  const result = calculateCascade(
    id,
    new Date(newEndDate),
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

  // Apply updates directly (no transaction — all updates are on the same plot, safe without wrapping)
  {
    // Update the changed job — shift both start and end dates, preserve originals
    // Snap endDate to working day to prevent weekend misalignment in downstream cascade
    const rawEndDate = new Date(newEndDate);
    const snappedEndDate = snapToWorkingDay(rawEndDate, "forward");
    const triggerUpdate: Record<string, unknown> = {
      endDate: snappedEndDate,
    };
    if (job.startDate && result.deltaDays !== 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let newStart = addWorkingDays(job.startDate, result.deltaDays);
      if (newStart < today) newStart = snapToWorkingDay(today, "forward");
      else newStart = snapToWorkingDay(newStart, "forward");
      triggerUpdate.startDate = newStart;
    }
    if (!job.originalEndDate && job.endDate) {
      triggerUpdate.originalEndDate = job.endDate;
    }
    if (!job.originalStartDate && job.startDate) {
      triggerUpdate.originalStartDate = job.startDate;
    }
    await prisma.job.update({
      where: { id },
      data: triggerUpdate,
    });

    // Build a map of current job dates for preserving originals
    const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

    // Batch update subsequent jobs using Promise.all for speed
    await Promise.all(result.jobUpdates.map((update) => {
      const currentJob = jobMap.get(update.jobId);
      return prisma.job.update({
        where: { id: update.jobId },
        data: {
          startDate: update.newStart,
          endDate: update.newEnd,
          ...(!currentJob?.originalStartDate && currentJob?.startDate ? { originalStartDate: currentJob.startDate } : {}),
          ...(!currentJob?.originalEndDate && currentJob?.endDate ? { originalEndDate: currentJob.endDate } : {}),
        },
      });
    }));

    // Batch update orders using Promise.all for speed
    await Promise.all(result.orderUpdates.map((update) =>
      prisma.materialOrder.update({
        where: { id: update.orderId },
        data: {
          dateOfOrder: update.newOrderDate,
          expectedDeliveryDate: update.newDeliveryDate,
        },
      })
    ));

    // Recompute every affected parent job's dates/status from its (now-shifted) children
    const { recomputeParentFromChildren } = await import("@/lib/parent-job");
    const shiftedIds = [id, ...result.jobUpdates.map((u) => u.jobId)];
    const parentIds = new Set<string>();
    for (const shiftedId of shiftedIds) {
      const shiftedJob = await prisma.job.findUnique({
        where: { id: shiftedId },
        select: { parentId: true },
      });
      if (shiftedJob?.parentId) parentIds.add(shiftedJob.parentId);
    }
    for (const parentId of parentIds) {
      await recomputeParentFromChildren(prisma, parentId);
    }

    // Log event
    await prisma.eventLog.create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `Schedule cascaded from "${job.name}" — ${result.deltaDays > 0 ? "+" : ""}${result.deltaDays} days, ${result.jobUpdates.length} jobs shifted`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });
  }

  return NextResponse.json({
    applied: true,
    deltaDays: result.deltaDays,
    jobsUpdated: result.jobUpdates.length,
    ordersUpdated: result.orderUpdates.length,
  });
}
