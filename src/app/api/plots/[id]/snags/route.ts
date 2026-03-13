import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/plots/[id]/snags — list snags for a plot
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");

  const snags = await prisma.snag.findMany({
    where: {
      plotId: id,
      ...(status && { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }),
      ...(priority && { priority: priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      photos: { select: { id: true, url: true }, take: 3 },
      _count: { select: { photos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(snags);
}

// POST /api/plots/[id]/snags — create a snag
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { description, location, priority, assignedToId, notes } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  const validPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (priority && !validPriorities.includes(priority)) {
    return NextResponse.json(
      { error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` },
      { status: 400 }
    );
  }

  // Get plot's siteId for event logging
  const plot = await prisma.plot.findUnique({
    where: { id },
    select: { siteId: true, plotNumber: true, name: true },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  const snag = await prisma.snag.create({
    data: {
      plotId: id,
      description: description.trim(),
      location: location || null,
      priority: priority || "MEDIUM",
      assignedToId: assignedToId || null,
      raisedById: session.user.id,
      notes: notes || null,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      photos: true,
      _count: { select: { photos: true } },
    },
  });

  // Log event
  await prisma.eventLog.create({
    data: {
      type: "SNAG_CREATED",
      description: `Snag raised on Plot ${plot.plotNumber || plot.name}: "${description.trim().slice(0, 60)}"`,
      siteId: plot.siteId,
      plotId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(snag, { status: 201 });
}
