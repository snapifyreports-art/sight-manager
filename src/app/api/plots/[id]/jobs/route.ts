import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/plots/[id]/jobs — create a job in a plot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: plotId } = await params;
  const body = await request.json();
  const { name, description, assignedToId, startDate, endDate } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Job name is required" },
      { status: 400 }
    );
  }

  // Verify plot exists and get site info
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    include: { site: { select: { id: true, name: true } } },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  const job = await prisma.job.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      plotId,
      assignedToId: assignedToId || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
    include: {
      assignedTo: {
        select: { id: true, name: true },
      },
    },
  });

  // Log the event
  await prisma.eventLog.create({
    data: {
      type: "JOB_STARTED",
      description: `Job "${job.name}" was created in plot "${plot.name}" on site "${plot.site.name}"`,
      siteId: plot.site.id,
      plotId: plot.id,
      jobId: job.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
