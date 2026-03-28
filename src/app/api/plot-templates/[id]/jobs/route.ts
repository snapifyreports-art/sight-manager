import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/plot-templates/[id]/jobs — add a job to a template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description, stageCode, sortOrder, startWeek, endWeek, parentId, durationWeeks, contactId } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Job name is required" },
      { status: 400 }
    );
  }

  if (startWeek == null || endWeek == null) {
    return NextResponse.json(
      { error: "startWeek and endWeek are required" },
      { status: 400 }
    );
  }

  const template = await prisma.plotTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  const job = await prisma.templateJob.create({
    data: {
      templateId: id,
      name: name.trim(),
      description: description?.trim() || null,
      stageCode: stageCode?.trim() || null,
      sortOrder: sortOrder ?? 0,
      startWeek,
      endWeek,
      parentId: parentId || null,
      durationWeeks: durationWeeks ?? null,
      contactId: contactId || null,
    },
    include: {
      orders: {
        include: { items: true },
      },
      children: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(job, { status: 201 });
}
