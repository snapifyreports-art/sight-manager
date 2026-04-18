import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/snags/[id]/request-signoff
// Contractor requests sign-off on a snag — optionally with notes and photos
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { notes } = body as { notes?: string };

  const snag = await prisma.snag.findUnique({
    where: { id },
    include: {
      plot: { select: { plotNumber: true, name: true, site: { select: { id: true, name: true } } } },
    },
  });

  if (!snag) {
    return NextResponse.json({ error: "Snag not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, snag.plot.site.id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  if (snag.status === "RESOLVED" || snag.status === "CLOSED") {
    return NextResponse.json({ error: "Snag is already resolved" }, { status: 400 });
  }

  // Update snag status to IN_PROGRESS if OPEN, and append resolution notes
  const updateData: Record<string, unknown> = {
    status: "IN_PROGRESS",
  };

  if (notes) {
    const timestamp = new Date().toLocaleDateString("en-GB");
    const existingNotes = snag.notes || "";
    const separator = existingNotes ? "\n" : "";
    updateData.notes = `${existingNotes}${separator}[${timestamp}] Contractor notes: ${notes}`;
  }

  try {
    await prisma.snag.update({
      where: { id },
      data: updateData,
    });

    // Log the request
    const plotLabel = snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name;
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Snag sign-off requested: "${snag.description}" on ${plotLabel}`,
        siteId: snag.plot.site.id,
        plotId: snag.plotId,
        userId: session.user.id,
      },
    });

    // Send push notification
    await sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
      title: `Snag Sign-Off Requested`,
      body: `${plotLabel} on ${snag.plot.site.name}: "${snag.description}" — contractor says this is resolved`,
      url: `/sites/${snag.plot.site.id}?tab=snags&snagId=${id}`,
      tag: `snag-signoff-${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to request snag sign-off");
  }
}
