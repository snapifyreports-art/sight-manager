import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/sites/[id] — single site with plots and their jobs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      plots: {
        orderBy: { createdAt: "asc" },
        include: {
          jobs: {
            orderBy: { createdAt: "asc" },
            include: {
              assignedTo: {
                select: { id: true, name: true },
              },
            },
          },
          _count: {
            select: { jobs: true },
          },
        },
      },
      _count: {
        select: { plots: true },
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json(site);
}

// PUT /api/sites/[id] — update site
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
  const { name, description, location, address, postcode, status } = body;

  const existing = await prisma.site.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const validStatuses = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const site = await prisma.site.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
      ...(location !== undefined && {
        location: location?.trim() || null,
      }),
      ...(address !== undefined && {
        address: address?.trim() || null,
      }),
      ...(postcode !== undefined && {
        postcode: postcode?.trim() || null,
      }),
      ...(status !== undefined && { status }),
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      plots: {
        orderBy: { createdAt: "asc" },
        include: {
          jobs: {
            orderBy: { createdAt: "asc" },
            include: {
              assignedTo: {
                select: { id: true, name: true },
              },
            },
          },
          _count: {
            select: { jobs: true },
          },
        },
      },
      _count: {
        select: { plots: true },
      },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "SITE_UPDATED",
      description: `Site "${site.name}" was updated`,
      siteId: site.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(site);
}

// DELETE /api/sites/[id] — delete site (cascades to plots and jobs)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "DELETE_ITEMS")) {
    return NextResponse.json({ error: "You do not have permission to delete sites" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.site.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  await prisma.site.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
