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
    const site = await prisma.site.create({
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

    // Auto-grant UserSite access so non-admin creators/managers can see their own site.
    // CEOs/DIRECTORs bypass UserSite entirely (site-access.ts), so these rows are a safety
    // net for other roles — idempotent via skipDuplicates.
    const grantees = new Set<string>([session.user.id]);
    if (assignedToId && assignedToId !== session.user.id) grantees.add(assignedToId);
    await prisma.userSite.createMany({
      data: Array.from(grantees).map((userId) => ({ userId, siteId: site.id })),
      skipDuplicates: true,
    });

    // Log the event
    await prisma.eventLog.create({
      data: {
        type: "SITE_CREATED",
        description: `Site "${site.name}" was created`,
        siteId: site.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(site, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create site");
  }
}
