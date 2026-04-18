import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/plots/[id] — single plot with site, jobs (including assignedTo and orders)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const plot = await prisma.plot.findUnique({
    where: { id },
    include: {
      site: {
        select: { id: true, name: true, status: true },
      },
      // Keep all jobs (parents + children) so Gantt/Programme can render hierarchy,
      // but _count reports LEAF jobs only so "X jobs" displays the actionable count.
      jobs: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
          orders: {
            include: {
              supplier: {
                select: { id: true, name: true, contactEmail: true, contactName: true },
              },
              orderItems: true,
            },
          },
        },
      },
      _count: {
        select: { jobs: { where: { children: { none: {} } } } },
      },
    },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.site.id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  return NextResponse.json(plot);
}

// PUT /api/plots/[id] — update plot
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description } = body;

  const existing = await prisma.plot.findUnique({
    where: { id },
    include: { site: { select: { id: true, name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.site.id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  try {
    const plot = await prisma.plot.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
      },
      include: {
        site: {
          select: { id: true, name: true, status: true },
        },
        jobs: {
          orderBy: { createdAt: "asc" },
          include: {
            assignedTo: {
              select: { id: true, name: true },
            },
            orders: {
              include: {
                supplier: {
                  select: { id: true, name: true, contactEmail: true, contactName: true },
                },
                orderItems: true,
              },
            },
          },
        },
        _count: {
          select: { jobs: { where: { children: { none: {} } } } },
        },
      },
    });

    await prisma.eventLog.create({
      data: {
        type: "PLOT_UPDATED",
        description: `Plot "${plot.name}" was updated in site "${existing.site.name}"`,
        siteId: existing.site.id,
        plotId: plot.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(plot);
  } catch (err) {
    return apiError(err, "Failed to update plot");
  }
}

// DELETE /api/plots/[id] — delete plot (cascades to jobs)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "DELETE_ITEMS")) {
    return NextResponse.json({ error: "You do not have permission to delete plots" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.plot.findUnique({
    where: { id },
    include: { site: { select: { id: true, name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.site.id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  try {
    // Audit event BEFORE delete so siteId is captured (EventLog.plotId SetNull survives)
    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Plot "${existing.plotNumber || existing.name}" was deleted from site "${existing.site.name}"`,
        siteId: existing.site.id,
        plotId: existing.id,
        userId: session.user.id,
      },
    });

    await prisma.plot.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete plot");
  }
}
