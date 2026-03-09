import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const type = searchParams.get("type");
  const workflowId = searchParams.get("workflowId");
  const jobId = searchParams.get("jobId");

  // Build where clause from filters
  const where: Record<string, unknown> = {};

  if (type && Object.values(EventType).includes(type as EventType)) {
    where.type = type;
  }

  if (workflowId) {
    where.workflowId = workflowId;
  }

  if (jobId) {
    where.jobId = jobId;
  }

  const [events, total] = await Promise.all([
    prisma.eventLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        workflow: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, workflowId: true } },
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
