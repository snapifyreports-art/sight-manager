import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      contractors: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      },
      orders: {
        include: { supplier: true, orderItems: true },
        orderBy: { createdAt: "desc" },
      },
      actions: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

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

  const existing = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    name: body.name ?? existing.name,
    description: body.description !== undefined ? body.description : existing.description,
    plotId: body.plotId ?? existing.plotId,
    assignedToId: body.assignedToId !== undefined ? body.assignedToId : existing.assignedToId,
    location: body.location !== undefined ? body.location : existing.location,
    address: body.address !== undefined ? body.address : existing.address,
  };

  if (body.startDate !== undefined) {
    // Preserve original on first manual edit
    if (!existing.originalStartDate && existing.startDate) {
      updateData.originalStartDate = existing.startDate;
    }
    updateData.startDate = body.startDate ? new Date(body.startDate) : null;
  }
  if (body.endDate !== undefined) {
    if (!existing.originalEndDate && existing.endDate) {
      updateData.originalEndDate = existing.endDate;
    }
    updateData.endDate = body.endDate ? new Date(body.endDate) : null;
  }

  const job = await prisma.job.update({
    where: { id },
    data: updateData,
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      _count: { select: { orders: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "JOB_EDITED",
      description: `Job "${job.name}" was updated`,
      siteId: job.plot.siteId,
      plotId: job.plotId,
      jobId: job.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "DELETE_ITEMS")) {
    return NextResponse.json({ error: "You do not have permission to delete jobs" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await prisma.job.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
