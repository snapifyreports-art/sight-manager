import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    include: {
      workflow: true,
      assignedTo: true,
      _count: { select: { orders: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { workflowId, name, description, assignedToId, location, address, siteName, plot, startDate, endDate } = body;

  if (!workflowId || !name) {
    return NextResponse.json(
      { error: "workflowId and name are required" },
      { status: 400 }
    );
  }

  const job = await prisma.job.create({
    data: {
      workflowId,
      name,
      description: description || null,
      assignedToId: assignedToId || null,
      location: location || null,
      address: address || null,
      siteName: siteName || null,
      plot: plot || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      workflow: true,
      assignedTo: true,
      _count: { select: { orders: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Job "${job.name}" was created`,
      workflowId: job.workflowId,
      jobId: job.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
