import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";

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

  // Build where clause from filters
  const where: Record<string, unknown> = {};

  if (type && Object.values(EventType).includes(type as EventType)) {
    where.type = type;
  }

  if (siteId) {
    where.siteId = siteId;
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
      orderBy: { createdAt: "desc" },
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
