import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { recomputeParentOf } from "@/lib/parent-job";
import { canAccessSite } from "@/lib/site-access";

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

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
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

  // Editing job details (name, dates, assignee) is a programme change
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "EDIT_PROGRAMME")) {
    return NextResponse.json({ error: "You do not have permission to edit jobs" }, { status: 403 });
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

  // Base site-access check — caller must have access to the job's current site
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  // Guard cross-site plot reassignment — both source & target must be accessible to the caller
  if (body.plotId !== undefined && body.plotId !== existing.plotId) {
    const targetPlot = await prisma.plot.findUnique({
      where: { id: body.plotId },
      select: { siteId: true },
    });
    if (!targetPlot) {
      return NextResponse.json({ error: "Target plot not found" }, { status: 404 });
    }
    const { getUserSiteIds } = await import("@/lib/site-access");
    const accessibleSites = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);
    if (accessibleSites !== null) {
      if (!accessibleSites.includes(existing.plot.siteId) || !accessibleSites.includes(targetPlot.siteId)) {
        return NextResponse.json(
          { error: "You do not have access to both the source and target site" },
          { status: 403 }
        );
      }
    }
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

  // Validate startDate <= endDate
  const finalStart = updateData.startDate ?? existing.startDate;
  const finalEnd = updateData.endDate ?? existing.endDate;
  if (finalStart && finalEnd && new Date(finalStart as string | Date) > new Date(finalEnd as string | Date)) {
    return NextResponse.json(
      { error: "Start date cannot be after end date" },
      { status: 400 }
    );
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

  // If this job has a parent, let the parent's dates/status follow
  await recomputeParentOf(prisma, id);

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

  const existing = await prisma.job.findUnique({
    where: { id },
    include: { plot: { select: { siteId: true, plotNumber: true, name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  // Write event log BEFORE deletion so siteId is captured; the event survives
  // the job delete because of onDelete: SetNull on EventLog.jobId
  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Job "${existing.name}" was deleted from plot ${existing.plot.plotNumber || existing.plot.name}`,
      siteId: existing.plot.siteId,
      plotId: existing.plotId,
      jobId: existing.id,
      userId: session.user.id,
    },
  });

  const parentIdToRecompute = existing.parentId;
  await prisma.job.delete({ where: { id } });

  // If this was a sub-job, parent's dates/status may need updating based on remaining siblings
  if (parentIdToRecompute) {
    const { recomputeParentFromChildren } = await import("@/lib/parent-job");
    await recomputeParentFromChildren(prisma, parentIdToRecompute);
  }

  return NextResponse.json({ success: true });
}
