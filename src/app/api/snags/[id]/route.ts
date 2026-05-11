import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { addDays, format } from "date-fns";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/snags/[id] — get a single snag
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const snag = await prisma.snag.findUnique({
    where: { id },
    include: {
      photos: true,
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, email: true, company: true } },
      raisedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true, parent: { select: { name: true } } } },
      plot: { select: { id: true, name: true, plotNumber: true, siteId: true } },
    },
  });

  if (!snag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Site-access guard. Returning a 404 instead of 403 deliberately so the
  // existence of the snag isn't leaked to a caller without rights.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      snag.plot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(snag);
}

// PATCH /api/snags/[id] — update a snag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const now = getServerCurrentDate(req);
  const body = await req.json();
  const { status, priority, assignedToId, contactId, jobId, notes, location, description } = body;

  const existing = await prisma.snag.findUnique({
    where: { id },
    include: { plot: { select: { siteId: true, plotNumber: true, name: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Site-access guard — same pattern as GET. 404 not 403 so we don't leak
  // existence of the snag to an unprivileged caller.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      existing.plot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isResolving =
    status === "RESOLVED" && existing.status !== "RESOLVED";

  try {
  const snag = await prisma.snag.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      ...(contactId !== undefined && { contactId: contactId || null }),
      ...(notes !== undefined && { notes }),
      ...(location !== undefined && { location }),
      ...(description !== undefined && { description }),
      ...(jobId !== undefined && { jobId: jobId || null }),
      // (#180) Set resolvedAt on RESOLVED → first time. Also set it on
      // CLOSED if we somehow got there without going through RESOLVED
      // (a snag dismissed directly from OPEN). Reports query
      // resolvedAt for "snag age at close"; without this, an
      // OPEN→CLOSED snag would have resolvedAt=null and be excluded.
      ...((isResolving ||
        (status === "CLOSED" && !existing.resolvedAt)) && {
        resolvedAt: now,
        resolvedById: session.user.id,
      }),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, email: true, company: true } },
      raisedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true, parent: { select: { name: true } } } },
      photos: { select: { id: true, url: true }, take: 3 },
      _count: { select: { photos: true } },
    },
  });

  if (isResolving) {
    const reinspectDate = format(addDays(now, 7), "dd MMM yyyy");
    const reinspectNote = `Re-inspection required \u2014 verify fix by ${reinspectDate}`;

    // Append re-inspection reminder to notes
    const currentNotes = snag.notes || "";
    const updatedNotes = currentNotes
      ? `${currentNotes}\n\n[${format(now, "dd/MM/yyyy")}] ${reinspectNote}`
      : `[${format(now, "dd/MM/yyyy")}] ${reinspectNote}`;

    await prisma.snag.update({
      where: { id },
      data: { notes: updatedNotes },
    });

    await prisma.eventLog.create({
      data: {
        type: "SNAG_RESOLVED",
        description: `Snag resolved on Plot ${existing.plot.plotNumber || existing.plot.name}: "${existing.description.slice(0, 60)}". ${reinspectNote}`,
        siteId: existing.plot.siteId,
        plotId: existing.plotId,
        userId: session.user.id,
      },
    });

    // Log to the linked job
    if (existing.jobId) {
      await prisma.jobAction.create({
        data: {
          jobId: existing.jobId,
          userId: session.user.id,
          action: "note",
          notes: `✅ Snag resolved: "${existing.description.slice(0, 80)}". ${reinspectNote}`,
        },
      });
    }
  }

  // Log snag CLOSED to EventLog + linked job
  const isClosing = status === "CLOSED" && existing.status !== "CLOSED";
  if (isClosing) {
    const closeDesc = notes
      ? `Snag closed on Plot ${existing.plot.plotNumber || existing.plot.name}: "${existing.description.slice(0, 60)}" — ${notes}`
      : `Snag closed on Plot ${existing.plot.plotNumber || existing.plot.name}: "${existing.description.slice(0, 60)}"`;

    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: closeDesc,
        siteId: existing.plot.siteId,
        plotId: existing.plotId,
        jobId: existing.jobId || undefined,
        userId: session.user.id,
      },
    });

    if (existing.jobId) {
      await prisma.jobAction.create({
        data: {
          jobId: existing.jobId,
          userId: session.user.id,
          action: "note",
          notes: `🔒 Snag closed: "${existing.description.slice(0, 80)}"${notes ? ` — ${notes}` : ""}`,
        },
      });
    }
  }

  // Log status changes (open → in_progress) to EventLog
  const isStatusChange = status && status !== existing.status && status !== "RESOLVED" && status !== "CLOSED";
  if (isStatusChange) {
    const statusLabel = status === "IN_PROGRESS" ? "In Progress" : status.charAt(0) + status.slice(1).toLowerCase();
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Snag status updated to ${statusLabel} on Plot ${existing.plot.plotNumber || existing.plot.name}: "${existing.description.slice(0, 60)}"`,
        siteId: existing.plot.siteId,
        plotId: existing.plotId,
        jobId: existing.jobId || undefined,
        userId: session.user.id,
      },
    });
  }

  return NextResponse.json(snag);
  } catch (err) {
    return apiError(err, "Failed to update snag");
  }
}

// DELETE /api/snags/[id] — delete a snag and its photos
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const snag = await prisma.snag.findUnique({
    where: { id },
    include: {
      photos: true,
      plot: { select: { siteId: true } },
    },
  });

  if (!snag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Site-access guard. Same 404-not-403 pattern as GET/PATCH.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      snag.plot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Delete photos from Supabase Storage
    for (const photo of snag.photos) {
      const urlParts = photo.url.split(`${PHOTOS_BUCKET}/`);
      if (urlParts.length > 1) {
        await getSupabase().storage.from(PHOTOS_BUCKET).remove([urlParts[1]]);
      }
    }

    await prisma.snag.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete snag");
  }
}
