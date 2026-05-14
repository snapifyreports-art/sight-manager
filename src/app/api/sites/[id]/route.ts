import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      assignedTo: {
        select: { id: true, name: true },
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
            // Count leaf jobs only — parents are derived rollups
            select: { jobs: { where: { children: { none: {} } } } },
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
  const { name, description, location, address, postcode, status, assignedToId } = body;

  // (May 2026 audit B-1) Pre-fix this route had NO RBAC at all — any
  // authenticated user (including a CONTRACTOR with no UserSite row)
  // could rename any site, flip its status, or reassign it to
  // themselves (which auto-grants UserSite access below). Now: must
  // (a) have site access, AND (b) hold EDIT_PROGRAMME permission. Plus
  // assignedToId changes additionally require MANAGE_USERS because
  // they implicitly grant another user site access.
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to edit this site" },
      { status: 403 },
    );
  }
  if (
    assignedToId !== undefined &&
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "MANAGE_USERS",
    )
  ) {
    return NextResponse.json(
      { error: "Only managers can reassign sites — assigning grants access" },
      { status: 403 },
    );
  }

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

  try {
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
        // Stamp completedAt the FIRST time status flips to COMPLETED so
        // the Story tab + Handover ZIP have a canonical site closure
        // date. Re-opening a closed site (COMPLETED → anything else)
        // clears it so a future re-close gets a fresh timestamp.
        ...(status !== undefined && status === "COMPLETED" && existing.status !== "COMPLETED"
          ? { completedAt: new Date() }
          : {}),
        ...(status !== undefined && status !== "COMPLETED" && existing.status === "COMPLETED"
          ? { completedAt: null }
          : {}),
        ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        assignedTo: {
          select: { id: true, name: true },
        },
        plots: {
          orderBy: { createdAt: "asc" },
          include: {
            jobs: {
              where: { children: { none: {} } },
              orderBy: { createdAt: "asc" },
              include: {
                assignedTo: {
                  select: { id: true, name: true },
                },
              },
            },
            _count: {
              select: { jobs: { where: { children: { none: {} } } } },
            },
          },
        },
        _count: {
          select: { plots: true },
        },
      },
    });

    // Cascade assignedToId to all jobs on this site
    if (assignedToId !== undefined && assignedToId !== existing.assignedToId) {
      const plotIds = (await prisma.plot.findMany({ where: { siteId: id }, select: { id: true } })).map((p) => p.id);
      if (plotIds.length > 0) {
        await prisma.job.updateMany({
          where: { plotId: { in: plotIds } },
          data: { assignedToId: assignedToId || null },
        });
      }
      // Auto-grant UserSite access to the new manager so they can actually see the site
      if (assignedToId) {
        await prisma.userSite.upsert({
          where: { userId_siteId: { userId: assignedToId, siteId: id } },
          update: {},
          create: { userId: assignedToId, siteId: id },
        });
      }
    }

    await prisma.eventLog.create({
      data: {
        type: "SITE_UPDATED",
        description: `Site "${site.name}" was updated`,
        siteId: site.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(site);
  } catch (err) {
    return apiError(err, "Failed to update site");
  }
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

  // (May 2026 audit #1) Permission check is generic — also check the
  // user actually has access to THIS site. Pre-fix anyone with the
  // DELETE_ITEMS permission could delete any site.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      id,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Audit trail — EventLog.siteId cascade-deletes with the site, so
      // record to a site-less audit entry instead (plotId/jobId/userId
      // SetNull survive).
      await tx.eventLog.create({
        data: {
          type: "USER_ACTION",
          description: `Site "${existing.name}" was deleted`,
          userId: session.user.id,
        },
      });

      // (May 2026) Hard-delete the site's MaterialOrders *before* the
      // site goes. MaterialOrder.jobId/siteId/plotId are all
      // `onDelete: SetNull`, so without this every order on the site
      // would survive as a contextless orphan — still PENDING/ORDERED,
      // still carrying delivery dates, still nagging the notifications
      // cron / Tasks / Orders page. Keith caught this: wiped test
      // sites had left 160 orphan orders behind. Reachable three ways:
      // one-off site orders, one-off plot orders, template job orders.
      await tx.materialOrder.deleteMany({
        where: {
          OR: [
            { siteId: id },
            { plot: { siteId: id } },
            { job: { plot: { siteId: id } } },
          ],
        },
      });

      await tx.site.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete site");
  }
}
