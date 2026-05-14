import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sendPushToSiteAudience } from "@/lib/push";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

// GET /api/plots/[id]/snags — list snags for a plot
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // (May 2026 audit B-2) Pre-fix neither GET nor POST checked site-access
  // — a Site A manager could read or write snags on a Plot belonging to
  // Site B. Look up the plot's site, then 404 if the caller can't see it
  // (404 not 403 so we don't leak existence to a stranger).
  const plotForAccess = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true },
  });
  if (!plotForAccess) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      plotForAccess.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");

  const snags = await prisma.snag.findMany({
    where: {
      plotId: id,
      ...(status && { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }),
      ...(priority && { priority: priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, email: true, company: true } },
      raisedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true, parent: { select: { name: true } } } },
      photos: { select: { id: true, url: true }, take: 3 },
      _count: { select: { photos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(snags);
}

// POST /api/plots/[id]/snags — create a snag
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
  const { description, location, priority, assignedToId, contactId, jobId, notes } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  // (May 2026 audit B-2) Site-access guard for POST. Mirror the GET
  // check — fetch the plot's siteId, 404 if the caller can't see it.
  // Pre-fix a Site A manager could POST snags onto a Site B plot.
  const accessCheckPlot = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true },
  });
  if (!accessCheckPlot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      accessCheckPlot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  const validPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (priority && !validPriorities.includes(priority)) {
    return NextResponse.json(
      { error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` },
      { status: 400 }
    );
  }

  // Get plot's siteId for event logging
  const plot = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true, plotNumber: true, name: true },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Auto-fill assignedToId and contactId from job if not provided
  let resolvedAssignedToId = assignedToId || null;
  let resolvedContactId = contactId || null;
  if (jobId && (!resolvedAssignedToId || !resolvedContactId)) {
    const linkedJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        assignedToId: true,
        contractors: {
          select: { contactId: true },
          orderBy: { createdAt: "asc" as const },
          take: 1,
        },
      },
    });
    if (linkedJob) {
      if (!resolvedAssignedToId && linkedJob.assignedToId) {
        resolvedAssignedToId = linkedJob.assignedToId;
      }
      if (!resolvedContactId && linkedJob.contractors[0]?.contactId) {
        resolvedContactId = linkedJob.contractors[0].contactId;
      }
    }
  }

  try {
    const snag = await prisma.snag.create({
      data: {
        plotId: id,
        jobId: jobId || null,
        description: description.trim(),
        location: location || null,
        priority: priority || "MEDIUM",
        assignedToId: resolvedAssignedToId,
        contactId: resolvedContactId,
        raisedById: session.user.id,
        notes: notes || null,
        createdAt: getServerCurrentDate(req),
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, email: true, company: true } },
        raisedBy: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, parent: { select: { name: true } } } },
        photos: true,
        _count: { select: { photos: true } },
      },
    });

    // Log event
    const eventLogPromise = logEvent(prisma, {
      type: "SNAG_CREATED",
      description: `Snag raised on Plot ${plot.plotNumber || plot.name}: "${description.trim().slice(0, 60)}"`,
      siteId: plot.siteId,
      plotId: id,
      jobId: jobId || null,
      userId: session.user.id,
      detail: {
        snagId: snag.id,
        priority: snag.priority,
        location: snag.location ?? null,
      },
    });

    // Link snag to job's notes/actions if a job was specified
    const jobActionPromise = jobId
      ? prisma.jobAction.create({
          data: {
            jobId,
            userId: session.user.id,
            action: "note",
            notes: `⚠️ Snag raised: "${description.trim().slice(0, 80)}"${location ? ` — ${location}` : ""}`,
          },
        })
      : Promise.resolve(null);

    await Promise.all([eventLogPromise, jobActionPromise]);

    // (May 2026 audit follow-up to #152) Fire a per-site push so the
    // site's assignee + watchers + execs know a snag was raised.
    // High-priority + critical snags get a louder notification.
    // Best-effort: failure here doesn't fail the snag creation.
    const isUrgent = priority === "HIGH" || priority === "CRITICAL";
    void sendPushToSiteAudience(plot.siteId, "SNAG_RAISED", {
      title: isUrgent ? `⚠️ ${priority} snag raised` : "Snag raised",
      body: `Plot ${plot.plotNumber || plot.name}: ${description.trim().slice(0, 80)}`,
      url: `/sites/${plot.siteId}?tab=snags&snagId=${snag.id}`,
      tag: `snag-${snag.id}`,
      renotify: isUrgent,
    }).catch((err) => {
      console.warn("[snag-create] sendPushToSiteAudience failed:", err);
    });

    return NextResponse.json(snag, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create snag");
  }
}
