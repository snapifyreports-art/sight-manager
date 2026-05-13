import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";
import { sessionHasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/sites — list sites the current user can access
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build site filter based on user's access
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const where = siteIds !== null ? { id: { in: siteIds } } : {};

  const sites = await prisma.site.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { plots: true },
      },
    },
  });

  return NextResponse.json(sites);
}

// POST /api/sites — create a new site
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (May 2026 audit B-3) Pre-fix this route was open to any authenticated
  // user — including CONTRACTORs — who could spawn a site, auto-grant
  // themselves UserSite access (line below), and optionally include an
  // assignedToId to grant a confederate access too. Gate behind
  // EDIT_PROGRAMME (the same permission required to edit a site).
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to create sites" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { name, description, location, address, postcode, assignedToId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Site name is required" },
      { status: 400 }
    );
  }

  // Validate that any passed assignedToId exists and is a manager-or-above
  // — otherwise the silent UserSite grant below would let an arbitrary
  // contractor be flagged as the manager of a brand-new site.
  if (assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, role: true },
    });
    if (!assignee) {
      return NextResponse.json(
        { error: "assignedToId does not match a known user" },
        { status: 400 },
      );
    }
    const managerRoles = ["SUPER_ADMIN", "CEO", "DIRECTOR", "SITE_MANAGER"];
    if (!managerRoles.includes(assignee.role)) {
      return NextResponse.json(
        { error: "Site can only be assigned to a manager-or-above user" },
        { status: 400 },
      );
    }
  }

  try {
    // (May 2026 audit #79) All-or-nothing: site create + UserSite grants
    // + audit log in one transaction. Pre-fix three separate writes —
    // mid-failure left a site that existed but had no UserSite or
    // audit row, confusing the user who saw "error" then "site name
    // already exists" on retry.
    const site = await prisma.$transaction(async (tx) => {
      const created = await tx.site.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          location: location?.trim() || null,
          address: address?.trim() || null,
          postcode: postcode?.trim() || null,
          createdById: session.user.id,
          ...(assignedToId ? { assignedToId } : {}),
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { plots: true },
          },
        },
      });

      const grantees = new Set<string>([session.user.id]);
      if (assignedToId && assignedToId !== session.user.id) grantees.add(assignedToId);
      await tx.userSite.createMany({
        data: Array.from(grantees).map((userId) => ({ userId, siteId: created.id })),
        skipDuplicates: true,
      });

      await tx.eventLog.create({
        data: {
          type: "SITE_CREATED",
          description: `Site "${created.name}" was created`,
          siteId: created.id,
          userId: session.user.id,
        },
      });

      return created;
    });

    return NextResponse.json(site, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create site");
  }
}
