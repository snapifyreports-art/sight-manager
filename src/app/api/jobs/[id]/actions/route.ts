import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EventType, JobStatus } from "@prisma/client";

const ACTION_STATUS_MAP: Record<string, JobStatus> = {
  start: "IN_PROGRESS",
  stop: "ON_HOLD",
  complete: "COMPLETED",
};

const ACTION_EVENT_MAP: Record<string, EventType> = {
  start: "JOB_STARTED",
  stop: "JOB_STOPPED",
  complete: "JOB_COMPLETED",
  edit: "JOB_EDITED",
};

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
  const { action, notes } = body;

  if (!action) {
    return NextResponse.json(
      { error: "action is required (start, stop, complete, edit)" },
      { status: 400 }
    );
  }

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Create the job action record
  await prisma.jobAction.create({
    data: {
      jobId: id,
      userId: session.user.id,
      action,
      notes: notes || null,
    },
  });

  // Update job status if applicable
  const newStatus = ACTION_STATUS_MAP[action];
  let job;

  if (newStatus) {
    job = await prisma.job.update({
      where: { id },
      data: { status: newStatus },
      include: {
        workflow: true,
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  } else {
    job = await prisma.job.findUnique({
      where: { id },
      include: {
        workflow: true,
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  }

  // Create event log entry
  const eventType = ACTION_EVENT_MAP[action] || "USER_ACTION";
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  await prisma.eventLog.create({
    data: {
      type: eventType,
      description: `Job "${existing.name}" was ${actionLabel === "Start" ? "started" : actionLabel === "Stop" ? "stopped" : actionLabel === "Complete" ? "completed" : "edited"}`,
      workflowId: existing.workflowId,
      jobId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(job);
}
