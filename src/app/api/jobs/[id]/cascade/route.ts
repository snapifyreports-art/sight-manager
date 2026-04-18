import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Cascade endpoint. See docs/cascade-spec.md for the full contract.
 *
 * POST  — preview the cascade (no DB writes). Returns jobUpdates, orderUpdates,
 *         conflicts, and deltaDays (in working days).
 * PUT   — apply the cascade. Returns a 409 if there are conflicts unless the
 *         caller passes `force: true`.
 *
 * The trigger job is handled uniformly with downstream jobs — calculateCascade
 * returns an updates list that includes the trigger. This fixes the prior bug
 * where the trigger's end was set to the raw client value while its start was
 * recomputed separately, causing duration drift.
 */

function buildCascadeArgs(allPlotJobs: Array<{ id: string; name: string; startDate: Date | null; endDate: Date | null; sortOrder: number; status: string }>, allOrders: Array<{ id: string; jobId: string | null; dateOfOrder: Date; expectedDeliveryDate: Date | null; status: string }>) {
  return {
    jobs: allPlotJobs.map((j) => ({
      id: j.id,
      name: j.name,
      startDate: j.startDate,
      endDate: j.endDate,
      sortOrder: j.sortOrder,
      status: j.status,
    })),
    orders: allOrders.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      dateOfOrder: o.dateOfOrder,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
    })),
  };
}

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
    return NextResponse.json({ error: "newEndDate is required" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });
  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
  });

  const { jobs, orders } = buildCascadeArgs(allPlotJobs, allOrders);
  const result = calculateCascade(id, new Date(newEndDate), jobs, orders);

  return NextResponse.json({
    preview: true,
    ...JSON.parse(JSON.stringify(result)),
  });
}

// PUT /api/jobs/[id]/cascade — apply the cascade
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
  const { newEndDate, confirm, force } = body;

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });
  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
  });

  const { jobs: cascadeJobs, orders: cascadeOrders } = buildCascadeArgs(allPlotJobs, allOrders);
  const result = calculateCascade(id, new Date(newEndDate), cascadeJobs, cascadeOrders);

  // I7: block the apply if there are conflicts unless force=true.
  if (result.conflicts.length > 0 && !force) {
    return NextResponse.json(
      {
        error: "Cascade would cause conflicts",
        conflicts: JSON.parse(JSON.stringify(result.conflicts)),
        deltaDays: result.deltaDays,
      },
      { status: 409 }
    );
  }

  try {
    // Build a lookup so we can preserve originalStart/End on first move (I9).
    const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

    // Apply every job update uniformly — trigger + downstream.
    await Promise.all(
      result.jobUpdates.map((update) => {
        const current = jobMap.get(update.jobId);
        return prisma.job.update({
          where: { id: update.jobId },
          data: {
            startDate: update.newStart,
            endDate: update.newEnd,
            ...(!current?.originalStartDate && current?.startDate
              ? { originalStartDate: current.startDate }
              : {}),
            ...(!current?.originalEndDate && current?.endDate
              ? { originalEndDate: current.endDate }
              : {}),
          },
        });
      })
    );

    // Apply order updates.
    await Promise.all(
      result.orderUpdates.map((update) =>
        prisma.materialOrder.update({
          where: { id: update.orderId },
          data: {
            dateOfOrder: update.newOrderDate,
            expectedDeliveryDate: update.newDeliveryDate,
          },
        })
      )
    );

    // I6: parent-stage rollup — recompute any parent whose children moved.
    const { recomputeParentFromChildren } = await import("@/lib/parent-job");
    const parentIds = new Set<string>();
    for (const update of result.jobUpdates) {
      const shiftedJob = await prisma.job.findUnique({
        where: { id: update.jobId },
        select: { parentId: true },
      });
      if (shiftedJob?.parentId) parentIds.add(shiftedJob.parentId);
    }
    for (const parentId of parentIds) {
      await recomputeParentFromChildren(prisma, parentId);
    }

    await prisma.eventLog.create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `Schedule cascaded from "${job.name}" — ${result.deltaDays > 0 ? "+" : ""}${result.deltaDays} working days, ${result.jobUpdates.length} jobs shifted`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      applied: true,
      deltaDays: result.deltaDays,
      jobsUpdated: result.jobUpdates.length,
      ordersUpdated: result.orderUpdates.length,
      conflicts: JSON.parse(JSON.stringify(result.conflicts)), // included for visibility, caller opted in via force
    });
  } catch (err) {
    return apiError(err, "Failed to apply cascade");
  }
}
