import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/sites — list all sites with plot counts and creator
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await prisma.site.findMany({
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
  const { name, description, location, address } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Site name is required" },
      { status: 400 }
    );
  }

  const site = await prisma.site.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      location: location?.trim() || null,
      address: address?.trim() || null,
      createdById: session.user.id,
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
}
