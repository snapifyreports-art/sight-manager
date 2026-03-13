import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { getServerCurrentDate } from "@/lib/dev-date";
import { addDays, format } from "date-fns";

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
      raisedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true, plotNumber: true, siteId: true } },
    },
  });

  if (!snag) {
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
  const { status, priority, assignedToId, notes, location, description } = body;

  const existing = await prisma.snag.findUnique({
    where: { id },
    include: { plot: { select: { siteId: true, plotNumber: true, name: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isResolving =
    status === "RESOLVED" && existing.status !== "RESOLVED";

  const snag = await prisma.snag.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      ...(notes !== undefined && { notes }),
      ...(location !== undefined && { location }),
      ...(description !== undefined && { description }),
      ...(isResolving && {
        resolvedAt: now,
        resolvedById: session.user.id,
      }),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
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
  }

  return NextResponse.json(snag);
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
    include: { photos: true },
  });

  if (!snag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete photos from Supabase Storage
  for (const photo of snag.photos) {
    const urlParts = photo.url.split(`${PHOTOS_BUCKET}/`);
    if (urlParts.length > 1) {
      await getSupabase().storage.from(PHOTOS_BUCKET).remove([urlParts[1]]);
    }
  }

  await prisma.snag.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
