import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";
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

  const body = await request.json();
  const { name, description, location, address, postcode, assignedToId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Site name is required" },
      { status: 400 }
    );
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
