import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
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
  const { action, notes, signOffNotes } = body;

  if (!action) {
    return NextResponse.json(
      { error: "action is required (start, stop, complete, edit)" },
      { status: 400 }
    );
  }

  const existing = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Create the job action record
  await prisma.jobAction.create({
    data: {
      jobId: id,
      userId: session.user.id,
      action,
      notes: notes || signOffNotes || null,
    },
  });

  // Update job status if applicable
  const newStatus = ACTION_STATUS_MAP[action];
  let job;

  if (newStatus) {
    // Build update data
    const updateData: Record<string, unknown> = { status: newStatus };

    // Handle start action — set actualStartDate
    if (action === "start" && !existing.actualStartDate) {
      updateData.actualStartDate = new Date();
    }

    // Handle complete/sign-off action
    if (action === "complete") {
      updateData.actualEndDate = new Date();
      updateData.signedOffById = session.user.id;
      updateData.signedOffAt = new Date();
      if (signOffNotes) {
        updateData.signOffNotes = signOffNotes;
      }
    }

    job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        plot: { include: { site: true } },
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  } else {
    job = await prisma.job.findUnique({
      where: { id },
      include: {
        plot: { include: { site: true } },
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  }

  // Create event log entry
  const eventType =
    action === "complete" ? "JOB_SIGNED_OFF" : ACTION_EVENT_MAP[action] || "USER_ACTION";
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  await prisma.eventLog.create({
    data: {
      type: eventType,
      description: `Job "${existing.name}" was ${action === "start" ? "started" : action === "stop" ? "stopped" : action === "complete" ? "signed off" : "edited"}`,
      siteId: existing.plot.siteId,
      plotId: existing.plotId,
      jobId: id,
      userId: session.user.id,
    },
  });

  // Fire-and-forget push notification for relevant actions
  if (action === "complete" && existing.assignedToId) {
    sendPushToUser(existing.assignedToId, "JOBS_READY_FOR_SIGNOFF", {
      title: "Job Completed",
      body: `"${existing.name}" has been completed and is ready for sign-off`,
      url: `/jobs/${id}`,
      tag: `job-complete-${id}`,
    }).catch(() => {});
  }

  // Push notification to next-stage contractors when a job is completed
  if (action === "complete") {
    // Find next jobs on same plot
    const allPlotJobs = await prisma.job.findMany({
      where: { plotId: existing.plotId },
      orderBy: { sortOrder: "asc" },
    });
    const nextSortOrder = allPlotJobs
      .filter((j) => j.sortOrder > existing.sortOrder)
      .reduce((min, j) => (j.sortOrder < min ? j.sortOrder : min), Infinity);

    if (nextSortOrder !== Infinity) {
      const nextJobs = allPlotJobs.filter((j) => j.sortOrder === nextSortOrder);
      for (const nj of nextJobs) {
        if (nj.assignedToId) {
          sendPushToUser(nj.assignedToId, "NEXT_STAGE_READY", {
            title: "Next Stage Ready",
            body: `"${existing.name}" is complete — "${nj.name}" can begin`,
            url: `/jobs/${nj.id}`,
            tag: `next-stage-${nj.id}`,
          }).catch(() => {});
        }
      }
    }
  }

  if (action === "note" && existing.assignedToId && existing.assignedToId !== session.user.id) {
    sendPushToUser(existing.assignedToId, "NEW_NOTES_PHOTOS", {
      title: "New Note Added",
      body: `A note was added to "${existing.name}"`,
      url: `/jobs/${id}`,
      tag: `note-${id}`,
    }).catch(() => {});
  }

  return NextResponse.json(job);
}
