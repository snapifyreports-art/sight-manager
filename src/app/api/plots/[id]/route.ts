import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
        select: { jobs: true },
      },
    },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
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
        select: { jobs: true },
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

  const { id } = await params;

  const existing = await prisma.plot.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  await prisma.plot.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
