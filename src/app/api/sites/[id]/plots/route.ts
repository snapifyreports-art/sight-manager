import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/sites/[id]/plots — create a plot in a site
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const body = await request.json();
  const { name, description, plotNumber, houseType, reservationType } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Plot name is required" },
      { status: 400 }
    );
  }

  // Verify site exists
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Check for duplicate plot number within site
  if (plotNumber) {
    const existing = await prisma.plot.findFirst({
      where: { siteId, plotNumber: plotNumber.toString().trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Plot number ${plotNumber} already exists in this site` },
        { status: 409 }
      );
    }
  }

  try {
    const plot = await prisma.plot.create({
      data: {
        name: name.trim(),
        plotNumber: plotNumber?.toString().trim() || null,
        description: description?.trim() || null,
        houseType: houseType?.trim() || null,
        reservationType: reservationType?.trim() || null,
        siteId,
      },
      include: {
        _count: {
          select: { jobs: { where: { children: { none: {} } } } },
        },
      },
    });

    // Log the event
    await prisma.eventLog.create({
      data: {
        type: "PLOT_CREATED",
        description: `Plot "${plot.name}" was created in site "${site.name}"`,
        siteId,
        plotId: plot.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(plot, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create plot");
  }
}
