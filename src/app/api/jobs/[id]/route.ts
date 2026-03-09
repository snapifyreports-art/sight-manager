import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      workflow: true,
      assignedTo: true,
      orders: {
        include: { supplier: true },
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

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const job = await prisma.job.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      workflowId: body.workflowId ?? existing.workflowId,
      assignedToId: body.assignedToId !== undefined ? body.assignedToId : existing.assignedToId,
      location: body.location !== undefined ? body.location : existing.location,
      address: body.address !== undefined ? body.address : existing.address,
      siteName: body.siteName !== undefined ? body.siteName : existing.siteName,
      plot: body.plot !== undefined ? body.plot : existing.plot,
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : existing.startDate,
      endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : existing.endDate,
    },
    include: {
      workflow: true,
      assignedTo: true,
      _count: { select: { orders: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "JOB_EDITED",
      description: `Job "${job.name}" was updated`,
      workflowId: job.workflowId,
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

  const { id } = await params;

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await prisma.job.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
