import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventType, Prisma } from "@prisma/client";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

const CATEGORY_TYPES: Record<string, EventType[]> = {
  jobs: ["JOB_STARTED", "JOB_COMPLETED", "JOB_STOPPED", "JOB_EDITED", "JOB_SIGNED_OFF"],
  orders: ["ORDER_PLACED", "ORDER_DELIVERED", "ORDER_CANCELLED", "DELIVERY_CONFIRMED"],
  snags: ["SNAG_CREATED", "SNAG_RESOLVED"],
  photos: ["PHOTO_UPLOADED"],
  weather: ["SYSTEM"],
  notes: ["USER_ACTION"],
  schedule: ["SCHEDULE_CASCADED"],
  system: ["SITE_CREATED", "SITE_UPDATED", "PLOT_CREATED", "PLOT_UPDATED", "NOTIFICATION"],
};

// GET /api/sites/[id]/log?plotId=&category=&page=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = 30;
  const plotId = searchParams.get("plotId");
  const category = searchParams.get("category");

  const where: Prisma.EventLogWhereInput = { siteId: id };

  if (plotId && plotId !== "all") {
    where.plotId = plotId;
  }

  if (category && category !== "all" && CATEGORY_TYPES[category]) {
    const types = CATEGORY_TYPES[category];
    if (category === "weather") {
      // Weather entries are SYSTEM type — forecast, rained-off days, weather impacts
      where.type = "SYSTEM";
      where.OR = [
        { description: { startsWith: "🌤" } },
        { description: { startsWith: "☔" } },
        { description: { startsWith: "🌡" } },
        { description: { contains: "Weather impact" } },
      ];
    } else if (category === "system") {
      // System excludes weather entries
      where.type = { in: types };
      where.NOT = { AND: [{ type: "SYSTEM" }] };
    } else {
      where.type = { in: types };
    }
  }

  const [events, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        siteId: true,
        plotId: true,
        jobId: true,
        user: { select: { id: true, name: true } },
        plot: { select: { id: true, name: true, plotNumber: true } },
        job: { select: { id: true, name: true } },
      },
      // (May 2026 audit #78) id tiebreaker — same-millisecond events
      // (common during cascade transactions) need a stable secondary
      // sort or pagination produces duplicates.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventLog.count({ where }),
  ]);

  return NextResponse.json({
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  });
}

// POST /api/sites/[id]/log — add a manual note
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // (May 2026 pattern sweep) Pre-fix POST skipped canAccessSite (GET
  // had it). Any auth'd user could inject EventLog rows attributed to
  // any site / plot / job they don't own.
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const body = await req.json();
  const { description, plotId } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const event = await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: description.trim(),
      siteId: id,
      plotId: plotId || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ ...event, createdAt: event.createdAt.toISOString() }, { status: 201 });
}
