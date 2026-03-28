import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";

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

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: {
      jobId: { in: allPlotJobs.map((j) => j.id) },
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

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: {
      jobId: { in: allPlotJobs.map((j) => j.id) },
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

  // Apply in transaction
  await prisma.$transaction(async (tx) => {
    // Update the changed job's end date
    await tx.job.update({
      where: { id },
      data: { endDate: new Date(newEndDate) },
    });

    // Update subsequent jobs
    for (const update of result.jobUpdates) {
      await tx.job.update({
        where: { id: update.jobId },
        data: {
          startDate: update.newStart,
          endDate: update.newEnd,
        },
      });
    }

    // Update orders
    for (const update of result.orderUpdates) {
      await tx.materialOrder.update({
        where: { id: update.orderId },
        data: {
          dateOfOrder: update.newOrderDate,
          expectedDeliveryDate: update.newDeliveryDate,
        },
      });
    }

    // Log event
    await tx.eventLog.create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `Schedule cascaded from "${job.name}" — ${result.deltaDays > 0 ? "+" : ""}${result.deltaDays} days, ${result.jobUpdates.length} jobs shifted`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });
  });

  return NextResponse.json({
    applied: true,
    deltaDays: result.deltaDays,
    jobsUpdated: result.jobUpdates.length,
    ordersUpdated: result.orderUpdates.length,
  });
}
