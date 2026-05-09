import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      contractors: { include: { contact: { select: { id: true, name: true, company: true } } } },
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
  const { plotId, name, description, assignedToId, location, address, startDate, endDate } = body;

  if (!plotId || !name) {
    return NextResponse.json(
      { error: "plotId and name are required" },
      { status: 400 }
    );
  }

  // (#13/#14) originalStartDate/EndDate are NOT NULL — fall back to
  // the planned date if provided, else creation time so the row stays
  // in valid state even for unscheduled jobs.
  const now = new Date();
  const startDateD = startDate ? new Date(startDate) : null;
  const endDateD = endDate ? new Date(endDate) : null;

  const job = await prisma.job.create({
    data: {
      plotId,
      name,
      description: description || null,
      assignedToId: assignedToId || null,
      location: location || null,
      address: address || null,
      startDate: startDateD,
      endDate: endDateD,
      originalStartDate: startDateD ?? now,
      originalEndDate: endDateD ?? now,
    },
    include: {
      plot: { include: { site: true } },
      assignedTo: true,
      _count: { select: { orders: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Job "${job.name}" was created`,
      siteId: job.plot.siteId,
      plotId: job.plotId,
      jobId: job.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
