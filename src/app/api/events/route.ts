import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const type = searchParams.get("type");
  const siteId = searchParams.get("siteId");
  const plotId = searchParams.get("plotId");
  const jobId = searchParams.get("jobId");

  // (May 2026 audit #1) Scope by accessible sites. Pre-fix this
  // returned every audit-log entry for any site the caller named in
  // ?siteId — even sites they had no business with. Admins (CEO /
  // DIRECTOR) keep their unfiltered view.
  const accessibleSiteIds = await getUserSiteIds(
    session.user.id,
    (session.user as { role: string }).role,
  );

  // Build where clause from filters
  const where: Record<string, unknown> = {};

  if (type && Object.values(EventType).includes(type as EventType)) {
    where.type = type;
  }

  if (siteId) {
    // If user explicitly filters to a specific site, enforce access.
    if (accessibleSiteIds !== null && !accessibleSiteIds.includes(siteId)) {
      return NextResponse.json(
        { error: "You do not have access to this site" },
        { status: 403 },
      );
    }
    where.siteId = siteId;
  } else if (accessibleSiteIds !== null) {
    // Non-admin without an explicit site filter: only show events on
    // their accessible sites OR events with no site (rare; e.g. user
    // actions logged at tenant level).
    where.OR = [
      { siteId: { in: accessibleSiteIds } },
      { siteId: null },
    ];
  }

  if (plotId) {
    where.plotId = plotId;
  }

  if (jobId) {
    where.jobId = jobId;
  }

  const [events, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        site: { select: { id: true, name: true } },
        plot: { select: { id: true, name: true, siteId: true } },
        job: { select: { id: true, name: true, plotId: true } },
      },
      // (May 2026 audit #78) id tiebreaker for stable ordering across
      // pages — without it, pagination can show duplicates / skips.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    events,
    total,
    page,
    totalPages,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, description, siteId, plotId, jobId } = body;

  if (!type || !description) {
    return NextResponse.json(
      { error: "type and description are required" },
      { status: 400 }
    );
  }

  // Validate event type
  if (!Object.values(EventType).includes(type as EventType)) {
    return NextResponse.json(
      { error: `Invalid event type: ${type}` },
      { status: 400 }
    );
  }

  // (May 2026 pattern sweep) Pre-fix POST accepted any caller-supplied
  // siteId/plotId/jobId without verifying access. Any authenticated user
  // could spam audit-log entries against any site they don't belong to,
  // or cross-attribute events between tenants.
  if (siteId) {
    const accessibleSiteIds = await getUserSiteIds(
      session.user.id,
      (session.user as { role: string }).role,
    );
    if (accessibleSiteIds !== null && !accessibleSiteIds.includes(siteId)) {
      return NextResponse.json(
        { error: "You do not have access to this site" },
        { status: 403 },
      );
    }
  }

  const event = await prisma.eventLog.create({
    data: {
      type: type as EventType,
      description,
      siteId: siteId || null,
      plotId: plotId || null,
      jobId: jobId || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
