import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/plot-templates/[id]/jobs/[jobId] — update a template job
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;
  const body = await request.json();
  const { name, description, stageCode, sortOrder, startWeek, endWeek } = body;

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  const updated = await prisma.templateJob.update({
    where: { id: jobId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
      ...(stageCode !== undefined && {
        stageCode: stageCode?.trim() || null,
      }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(startWeek !== undefined && { startWeek }),
      ...(endWeek !== undefined && { endWeek }),
    },
    include: {
      orders: {
        include: { items: true },
      },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/plot-templates/[id]/jobs/[jobId] — delete a template job
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, jobId } = await params;

  const job = await prisma.templateJob.findFirst({
    where: { id: jobId, templateId: id },
  });
  if (!job) {
    return NextResponse.json(
      { error: "Template job not found" },
      { status: 404 }
    );
  }

  await prisma.templateJob.delete({ where: { id: jobId } });

  return NextResponse.json({ success: true });
}
